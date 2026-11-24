import { Buffer } from 'node:buffer'
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { constants } from 'node:fs'
import { open, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { RequestError } from './storage.mjs'
import { acceptedStep, newSecret } from './totp.mjs'

const deriveKey = promisify(scrypt)
const scryptOptions = { N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 ** 2 }
const usernamePattern = /^[a-z\d][\w.-]{2,39}$/i
const digit = /^[a-f\d]+$/
const sessionSeconds = 12 * 60 * 60
const enrollmentMs = 10 * 60 * 1000
const attemptWindowMs = 10 * 60 * 1000
const cookieName = 'files_session'
const defaultUsername = 'admin'
const wrongCredentials = 'The password or sign-in code is incorrect.'

const randomHex = size => randomBytes(size).toString('hex')
const digest = value => createHash('sha256').update(value).digest('hex')
const keyOf = value => typeof value === 'string' && usernamePattern.test(value) ? value.toLowerCase() : ''
const isHex = (value, length) => typeof value === 'string' && value.length === length && digit.test(value)
const canHash = password => typeof password === 'string' && Buffer.byteLength(password) <= 256
const accountInfo = user => ({ username: user.username, totp_enabled: Boolean(user.totp) })

function validAccount(user) {
	return user && keyOf(user.username) && ['admin', 'member'].includes(user.role)
		&& isHex(user.password?.salt, 32) && isHex(user.password?.hash, 128)
		&& (user.totp === null || (/^[A-Z2-7]{32}$/.test(user.totp?.secret)
			&& Number.isSafeInteger(user.totp.lastStep) && user.totp.lastStep >= 0
			&& Array.isArray(user.totp.recovery) && user.totp.recovery.every(code => isHex(code, 64))))
}

async function loadAccount(path) {
	let file
	try {
		file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
		const stat = await file.stat()
		if (!stat.isFile() || stat.size > 1024 * 1024)
			throw new Error('Invalid Files accounts file.')
		const { version, users } = JSON.parse(await file.readFile('utf8'))
		if (version !== 1 || !Array.isArray(users) || !users.every(validAccount))
			throw new Error('Invalid Files accounts file.')
		if (new Set(users.map(user => keyOf(user.username))).size !== users.length)
			throw new Error('Duplicate usernames in the Files accounts file.')
		// Older installations stored accounts in creation order.
		const administrator = users.find(user => user.role === 'admin')
		if (!administrator)
			throw new Error('Invalid Files accounts file.')
		return administrator
	} catch (error) {
		if (error.code === 'ENOENT')
			return null
		throw error
	} finally {
		await file?.close()
	}
}

async function passwordRecord(password) {
	if (!canHash(password) || Array.from(password).length < 12)
		throw new RequestError(400, 'Use a password of at least 12 characters and at most 256 bytes.')
	const salt = randomHex(16)
	const hash = await deriveKey(password, Buffer.from(salt, 'hex'), 64, scryptOptions)
	return { salt, hash: hash.toString('hex') }
}

async function passwordMatches(record, password) {
	if (!canHash(password))
		return false
	const candidate = await deriveKey(password, Buffer.from(record.salt, 'hex'), 64, scryptOptions)
	return timingSafeEqual(candidate, Buffer.from(record.hash, 'hex'))
}

function cookie(token, seconds, secure) {
	return `${cookieName}=${token}; Max-Age=${seconds}; Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`
}

function tokenOf(request) {
	return /(?:^|;\s*)files_session=([a-f\d]{64})(?:;|$)/.exec(request.headers.cookie || '')?.[1]
}

function recoveryDigest(code) {
	const normalized = typeof code === 'string' && code.trim().toLowerCase().replaceAll('-', '')
	return isHex(normalized, 20) ? digest(normalized) : null
}

export async function openAccounts(state, setupCode) {
	const path = join(state, 'accounts.json')
	let account = await loadAccount(path)
	const sessions = new Map()
	const attempts = new Map()
	let pending = Promise.resolve()
	let queued = 0

	function change(operation) {
		if (queued >= 16)
			throw new RequestError(429, 'Files is busy. Try again in a moment.')
		queued++
		const result = pending.then(operation).finally(() => queued--)
		pending = result.catch(() => {})
		return result
	}

	async function save(user) {
		const temporary = `${path}.${randomHex(12)}.tmp`
		try {
			const file = await open(temporary, 'wx', 0o600)
			try {
				await file.writeFile(JSON.stringify({ version: 1, users: [user] }))
				await file.sync()
			} finally {
				await file.close()
			}
			await rename(temporary, path)
			account = user
		} finally {
			await rm(temporary, { force: true })
		}
	}

	function setupRequired() {
		return account === null
	}

	function sessionOf(request) {
		const token = tokenOf(request)
		const session = sessions.get(token)
		if (session?.expires <= Date.now()) {
			sessions.delete(token)
			return null
		}
		return session
	}

	function startSession(request, response, secure) {
		sessions.delete(tokenOf(request))
		if (sessions.size >= 1024) {
			for (const [token, session] of sessions) {
				if (session.expires <= Date.now())
					sessions.delete(token)
			}
			if (sessions.size >= 1024)
				sessions.delete(sessions.keys().next().value)
		}
		const token = randomHex(32)
		sessions.set(token, { expires: Date.now() + sessionSeconds * 1000 })
		response.setHeader('Set-Cookie', cookie(token, sessionSeconds, secure))
		return { user: accountInfo(account) }
	}

	function rotateSession(request, response, session, secure) {
		const stillSignedIn = sessionOf(request) === session
		sessions.clear()
		return stillSignedIn ? startSession(request, response, secure) : { user: null }
	}

	function limit(request, bucketKey = 'account') {
		const now = Date.now()
		if (attempts.size >= 2048) {
			for (const [id, bucket] of attempts) {
				if (bucket.until <= now)
					attempts.delete(id)
			}
		}
		const client = `ip:${request.socket.remoteAddress || ''}`
		for (const [id, maximum] of [[client, 40], [bucketKey, 12]]) {
			let bucket = attempts.get(id)
			if (!bucket || bucket.until <= now) {
				if (!bucket && attempts.size >= 2048)
					throw new RequestError(429, 'Too many attempts. Try again in a few minutes.')
				bucket = { count: 0, until: now + attemptWindowMs }
				attempts.set(id, bucket)
			}
			if (bucket.count >= maximum)
				throw new RequestError(429, 'Too many attempts. Try again in a few minutes.')
			bucket.count++
		}
	}

	async function signIn(body, request, response, secure) {
		if (setupRequired())
			throw new RequestError(409, 'Set up Files first.')
		const user = account
		const valid = await passwordMatches(user.password, body?.password)
		if (!valid || (body?.username !== undefined && keyOf(body.username) !== keyOf(user.username)))
			throw new RequestError(401, wrongCredentials)
		if (user.totp) {
			if (!body.code)
				return { requiresCode: true }
			const step = acceptedStep(user.totp.secret, body.code, user.totp.lastStep)
			const recovery = recoveryDigest(body.code)
			if (step === null && !user.totp.recovery.includes(recovery))
				throw new RequestError(401, wrongCredentials)
			const totp = { ...user.totp, lastStep: step ?? user.totp.lastStep, recovery: user.totp.recovery.filter(code => code !== recovery) }
			await save({ ...user, totp })
		}
		return startSession(request, response, secure)
	}

	async function manageFactor(route, body, request, response, session, user, secure) {
		if (route === 'POST /v1/users/2fa/setup') {
			if (user.totp)
				throw new RequestError(409, 'Two-factor sign-in is already on.')
			if (!await passwordMatches(user.password, body?.password))
				throw new RequestError(400, 'Your password is incorrect.')
			if (sessionOf(request) !== session)
				throw new RequestError(401, 'Sign in to Files.')
			const secret = newSecret()
			session.enrollment = { secret, expires: Date.now() + enrollmentMs }
			const label = encodeURIComponent(`Files:${user.username}`)
			return { secret, otpauth_url: `otpauth://totp/${label}?${new URLSearchParams({ secret, issuer: 'Files' })}` }
		}
		if (route === 'POST /v1/users/2fa/enable') {
			const enrollment = session.enrollment
			if (user.totp || !enrollment || enrollment.expires <= Date.now())
				throw new RequestError(410, 'Start two-factor setup again.')
			const step = acceptedStep(enrollment.secret, body?.code)
			if (step === null)
				throw new RequestError(400, 'That code did not match. Try the current code from your app.')
			const codes = Array.from({ length: 8 }, () => randomHex(10).match(/.{5}/g).join('-'))
			const totp = { secret: enrollment.secret, lastStep: step, recovery: codes.map(recoveryDigest) }
			await save({ ...user, totp })
			rotateSession(request, response, session, secure)
			return { recovery_codes: codes }
		}
		if (!user.totp)
			throw new RequestError(410, 'Two-factor sign-in is already off.')
		const valid = body?.password ? await passwordMatches(user.password, body.password) : acceptedStep(user.totp.secret, body?.code, user.totp.lastStep) !== null
		if (!valid)
			throw new RequestError(400, 'Your password or code is incorrect.')
		await save({ ...user, totp: null })
		return rotateSession(request, response, session, secure)
	}

	const factorRoutes = new Set(['POST /v1/users/2fa/setup', 'POST /v1/users/2fa/enable', 'POST /v1/users/2fa/disable'])

	return {
		setupRequired,
		signedIn(request) {
			return Boolean(sessionOf(request))
		},
		async handle(route, body, request, response, secure) {
			if (route === 'GET /v1/auth/session') {
				const user = sessionOf(request) ? accountInfo(account) : null
				return { needsSetup: setupRequired(), setupCodeRequired: setupRequired() && Boolean(setupCode), user }
			}
			if (route === 'POST /v1/auth/logout') {
				sessions.delete(tokenOf(request))
				response.setHeader('Set-Cookie', cookie('', 0, secure))
				return null
			}
			if (route === 'POST /v1/auth/setup' || route === 'POST /v1/auth/login') {
				limit(request, route.endsWith('/setup') ? 'setup' : 'account')
				return change(async () => {
					if (route.endsWith('/login'))
						return signIn(body, request, response, secure)
					if (!setupRequired())
						throw new RequestError(409, 'Files is already set up.')
					if (setupCode && (typeof body?.setupCode !== 'string' || !timingSafeEqual(Buffer.from(digest(body.setupCode.trim())), Buffer.from(digest(setupCode)))))
						throw new RequestError(403, 'The setup code is incorrect.')
					await save({ username: defaultUsername, role: 'admin', password: await passwordRecord(body?.password), totp: null })
					return startSession(request, response, secure)
				})
			}

			const session = sessionOf(request)
			if (!session)
				throw new RequestError(401, 'Sign in to Files.')
			if (!factorRoutes.has(route) && route !== 'PUT /v1/auth/password')
				throw new RequestError(404, 'The requested account endpoint is unavailable.')
			limit(request)
			return change(async () => {
				if (sessionOf(request) !== session)
					throw new RequestError(401, 'Sign in to Files.')
				const user = account
				if (factorRoutes.has(route))
					return manageFactor(route, body, request, response, session, user, secure)
				if (!await passwordMatches(user.password, body?.currentPassword))
					throw new RequestError(400, 'Your current password is incorrect.')
				await save({ ...user, password: await passwordRecord(body.password) })
				return rotateSession(request, response, session, secure)
			})
		},
	}
}
