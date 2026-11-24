import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it, vi } from 'vitest'
import { createFilesServer } from './server.mjs'
import { acceptedStep } from './totp.mjs'

const account = { username: 'admin', password: 'initial test passphrase' }
const cookieOf = response => response.headers.get('set-cookie')?.split(';')[0]

async function apiRequest(origin, route, { method = 'GET', body, cookie, headers } = {}) {
	return fetch(`${origin}${route}`, {
		method,
		headers: { ...(body && { 'Content-Type': 'application/json' }), ...(cookie && { cookie }), ...headers },
		body: body && JSON.stringify(body),
	})
}

const submit = (origin, route, body, cookie, method = 'POST') => apiRequest(origin, route, { method, body, cookie })

async function startServer(options, t) {
	const server = await createFilesServer(options)
	t.onTestFinished(() => server.close())
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
	return { server, origin: `http://127.0.0.1:${server.address().port}` }
}

it('standalone Files serves and updates only the configured data directory', async (t) => {
	const directory = await mkdtemp(join(tmpdir(), 'recasaos-files-'))
	t.onTestFinished(() => rm(directory, { recursive: true, force: true }))
	const assetsDirectory = join(directory, 'assets')
	const dataDirectory = join(directory, 'data')
	await mkdir(assetsDirectory)
	await mkdir(dataDirectory)
	await writeFile(join(assetsDirectory, 'index.html'), '<title>Files</title>')
	await writeFile(join(directory, 'private.txt'), 'outside the data folder')
	await symlink(directory, join(dataDirectory, 'outside'))
	const options = { assetsDirectory, directory: dataDirectory, maxUploadBytes: 64 }
	const { origin } = await startServer(options, t)
	assert.equal((await fetch(`${origin}/v1/folder?path=/DATA`)).status, 401)
	const cookie = cookieOf(await submit(origin, '/v1/auth/setup', account))
	assert.ok(cookie)
	const request = (path, method = 'GET', body, extra = {}) => fetch(origin + path, {
		method,
		headers: { cookie, ...extra },
		body: body === undefined || typeof body === 'string' ? body : JSON.stringify(body),
	})
	const list = async (path = '/DATA') => (await (await request(`/v1/folder?${new URLSearchParams({ path })}`)).json()).data.content

	assert.equal((await fetch(`${origin}/healthz`)).status, 200)
	const home = await request('/')
	assert.equal(home.status, 200)
	assert.equal(home.headers.get('www-authenticate'), null)
	assert.equal(await home.text(), '<title>Files</title>')
	assert.deepEqual(await list(), [])
	assert.equal((await request('/v1/folder?path=/DATA/outside')).status, 403)
	assert.equal((await request('/v3/file?path=/DATA/%2e%2e/private.txt')).status, 400)
	assert.equal((await request('/v1/folder?path=/DATA/.files-state')).status, 400)
	assert.equal((await request('/v1/file', 'POST', { path: '/DATA/cross-origin' }, { origin: 'https://example.test' })).status, 403)

	assert.equal((await request('/v1/folder', 'POST', { path: '/DATA/Docs' })).status, 200)
	assert.equal((await request('/v1/file', 'POST', { path: '/DATA/Docs/notes.txt' })).status, 200)
	assert.equal((await request('/v1/file', 'PUT', { path: '/DATA/Docs/notes.txt', content: 'hello' })).status, 200)
	assert.equal(await (await request('/v1/file?path=/DATA/Docs/notes.txt')).text(), 'hello')
	const partial = await request('/v3/file?path=/DATA/Docs/notes.txt', 'GET', undefined, { range: 'bytes=1-2' })
	assert.equal(partial.status, 206)
	assert.equal(await partial.text(), 'el')

	const upload = name => `/v2/casaos/file/upload?${new URLSearchParams({ path: '/DATA', relativePath: name, totalChunks: '1', chunkNumber: '1' })}`
	assert.equal((await request(upload('Photos/hello, world.txt'), 'POST', 'uploaded')).status, 200)
	assert.equal(await readFile(join(dataDirectory, 'Photos/hello, world.txt'), 'utf8'), 'uploaded')
	assert.equal((await request(upload('Photos/hello, world.txt'), 'POST', 'overwrite')).status, 409)
	assert.equal((await request(upload('large.txt'), 'POST', 'x'.repeat(65))).status, 413)
	assert.equal((await request(upload('outside/private.txt'), 'POST', 'overwrite')).status, 403)
	assert.equal(await readFile(join(directory, 'private.txt'), 'utf8'), 'outside the data folder')

	assert.equal((await request('/v1/file/name', 'PUT', { old_path: '/DATA/Docs/notes.txt', new_path: '/DATA/Docs/renamed.txt' })).status, 200)
	assert.equal((await request('/v1/batch/task', 'POST', { item: [{ from: '/DATA/Docs/renamed.txt' }], type: 'copy', to: '/DATA' })).status, 200)
	assert.equal((await request('/v1/batch/task', 'POST', { item: [{ from: '/DATA/renamed.txt' }], type: 'move', to: '/DATA/Photos' })).status, 200)
	const archive = await request('/v1/batch?path=/DATA/Docs&path=/DATA/Photos/hello%2C%20world.txt')
	assert.equal(archive.status, 200)
	const contents = execFileSync('tar', ['-tzf', '-'], { input: Buffer.from(await archive.arrayBuffer()), encoding: 'utf8' })
	assert.match(contents, /Docs\/renamed\.txt/)
	assert.match(contents, /Photos\/hello, world\.txt/)

	assert.equal((await request('/v1/batch?to_trash=true', 'DELETE', ['/DATA/Docs'])).status, 200)
	assert.deepEqual((await list()).map(item => item.name), ['Photos'])
	const { items } = (await (await request('/v1/file/trash')).json()).data
	assert.equal(items[0].path, '/DATA/Docs')
	assert.equal((await request('/v1/file/trash/restore', 'POST', items)).status, 200)
	assert.equal(await readFile(join(dataDirectory, 'Docs/renamed.txt'), 'utf8'), 'hello')
	assert.equal((await request('/v1/batch', 'DELETE', ['/DATA/Photos'])).status, 200)
	assert.deepEqual((await list()).map(item => item.name), ['Docs'])
})

it('saves a folder icon across renames, moves, restores and server restarts', async (t) => {
	const directory = await mkdtemp(join(tmpdir(), 'recasaos-files-folder-icon-'))
	t.onTestFinished(() => rm(directory, { recursive: true, force: true }))
	const assetsDirectory = join(directory, 'assets')
	const dataDirectory = join(directory, 'data')
	await mkdir(assetsDirectory)
	await writeFile(join(assetsDirectory, 'index.html'), '<title>Files</title>')
	await mkdir(join(dataDirectory, 'Projects', 'Music.svg'), { recursive: true })
	await writeFile(join(dataDirectory, 'file.txt'), 'file')
	const options = { assetsDirectory, directory: dataDirectory }
	const { server, origin } = await startServer(options, t)
	const iconRoute = '/v1/folder/icon'
	const musicPath = '/DATA/Projects/Music.svg'
	const setIcon = (origin, cookie, path, icon) => submit(origin, iconRoute, { path, icon }, cookie, 'PUT')
	const list = async (origin, cookie, path) => {
		const response = await apiRequest(origin, `/v1/folder?${new URLSearchParams({ path })}`, { cookie })
		return (await response.json()).data.content
	}

	assert.equal((await setIcon(origin, undefined, musicPath, 'music')).status, 401)
	const cookie = cookieOf(await submit(origin, '/v1/auth/setup', account))
	assert.equal((await setIcon(origin, cookie, '/DATA/file.txt', 'music')).status, 400)
	assert.equal((await setIcon(origin, cookie, musicPath, 'toString')).status, 400)
	assert.equal((await setIcon(origin, cookie, musicPath, 'music')).status, 200)
	assert.equal((await setIcon(origin, cookie, '/DATA/Projects', 'projects')).status, 200)

	assert.equal((await submit(origin, '/v1/folder/name', { old_path: '/DATA/Projects', new_path: '/DATA/Work' }, cookie, 'PUT')).status, 200)
	assert.equal((await submit(origin, '/v1/batch/task', { item: [{ from: musicPath.replace('Projects', 'Work') }], type: 'move', to: '/DATA' }, cookie)).status, 200)
	const movedPath = '/DATA/Music.svg'
	assert.equal((await list(origin, cookie, '/DATA')).find(item => item.path === movedPath).folder_icon, 'music')
	assert.equal((await submit(origin, '/v1/batch?to_trash=true', [movedPath], cookie, 'DELETE')).status, 200)
	const { data } = await (await apiRequest(origin, '/v1/file/trash', { cookie })).json()
	assert.equal(data.items[0].folder_icon, 'music')
	assert.equal((await submit(origin, '/v1/file/trash/restore', data.items, cookie)).status, 200)
	await new Promise(resolve => server.close(resolve))

	const restarted = await startServer(options, t)
	const secondCookie = cookieOf(await submit(restarted.origin, '/v1/auth/login', account))
	const saved = await list(restarted.origin, secondCookie, '/DATA')
	assert.equal(saved.find(item => item.path === movedPath).folder_icon, 'music')
	assert.equal(saved.find(item => item.path === '/DATA/Work').folder_icon, 'projects')
	assert.equal((await setIcon(restarted.origin, secondCookie, movedPath, null)).status, 200)
	assert.equal((await list(restarted.origin, secondCookie, '/DATA')).find(item => item.path === movedPath).folder_icon, undefined)
}, 20000)

const networkAddress = '192.168.1.50'
const proxyHost = 'files.example.test'

it.for([
	{ mode: 'local' },
	{ mode: 'direct', directAddress: networkAddress },
	{ mode: 'proxy', publicOrigin: `https://${proxyHost}` },
])('checks request hosts and origins ($mode)', async ({ directAddress, publicOrigin }, t) => {
	const directory = await mkdtemp(join(tmpdir(), 'recasaos-files-local-'))
	t.onTestFinished(() => rm(directory, { recursive: true, force: true }))
	const assetsDirectory = join(directory, 'assets')
	const dataDirectory = join(directory, 'data')
	await mkdir(assetsDirectory)
	await writeFile(join(assetsDirectory, 'index.html'), '<title>Files</title>')
	const { origin } = await startServer({ assetsDirectory, directory: dataDirectory, directAddress, publicOrigin }, t)
	const cookie = cookieOf(await submit(origin, '/v1/auth/setup', account))
	assert.ok(cookie)
	const route = '/v1/folder?path=/DATA'

	assert.equal((await fetch(origin, { headers: { 'sec-fetch-site': 'none' } })).status, 200)
	assert.equal((await fetch(origin + route, { headers: { cookie } })).status, 200)
	const requestStatus = (path, options, body) => new Promise((resolve, reject) => {
		const request = httpRequest(origin + path, { ...options, headers: { cookie, ...options.headers } }, (response) => {
			response.resume()
			resolve(response.statusCode)
		}).on('error', reject)
		request.end(body)
	})
	assert.equal(await requestStatus(route, { headers: { host: 'untrusted.test' } }), 403)
	const directHost = `${networkAddress}:8080`
	assert.equal(await requestStatus(route, { headers: { host: directHost } }), directAddress ? 200 : 403)
	assert.equal(await requestStatus('/v1/file', {
		method: 'POST',
		headers: { host: directHost, origin: `http://${directHost}` },
	}, JSON.stringify({ path: '/DATA/direct.txt' })), directAddress ? 200 : 403)
	assert.equal(await requestStatus('/v1/file', {
		method: 'POST',
		headers: { host: directHost, origin: `http://${networkAddress}:8000` },
	}, JSON.stringify({ path: '/DATA/refused-direct.txt' })), 403)
	assert.equal(await requestStatus(route, { headers: { host: proxyHost } }), publicOrigin ? 200 : 403)
	const navigationHeaders = { 'host': proxyHost, 'sec-fetch-site': 'cross-site', 'sec-fetch-dest': 'document' }
	assert.equal(await requestStatus('/', { headers: navigationHeaders }), publicOrigin ? 200 : 403)
	assert.equal(await requestStatus(route, { headers: navigationHeaders }), 403)
	assert.equal(await requestStatus('/v1/file', {
		method: 'POST',
		headers: { host: proxyHost, origin: `https://${proxyHost}` },
	}, JSON.stringify({ path: '/DATA/proxied.txt' })), publicOrigin ? 200 : 403)
	assert.equal(await requestStatus('/v1/file', {
		method: 'POST',
		headers: { host: proxyHost, origin: `http://${proxyHost}` },
	}, JSON.stringify({ path: '/DATA/refused.txt' })), 403)
	assert.equal((await fetch(origin + route, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403)
	assert.equal((await fetch(`${origin}/v1/file`, {
		method: 'POST',
		headers: { origin: 'http://localhost:5000' },
		body: JSON.stringify({ path: '/DATA/refused.txt' }),
	})).status, 403)
})

function totpCode(secret, time) {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
	const bits = [...secret].map(char => alphabet.indexOf(char).toString(2).padStart(5, '0')).join('')
	const key = Buffer.from(bits.match(/.{8}/g).map(byte => Number.parseInt(byte, 2)))
	const counter = Buffer.alloc(8)
	counter.writeBigUInt64BE(BigInt(Math.floor(time / 30_000)))
	const result = createHmac('sha1', key).update(counter).digest()
	return String((result.readUInt32BE(result.at(-1) & 15) & 0x7FFFFFFF) % 1_000_000).padStart(6, '0')
}

it('matches the RFC 6238 SHA-1 example and refuses to reuse an accepted step', () => {
	const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
	assert.equal(acceptedStep(secret, '287082', -1, 59_000), 1)
	assert.equal(acceptedStep(secret, '287082', 1, 59_000), null)
})

it('sets up a single administrator, protects files and manages members and their two-factor sessions', { timeout: 20_000 }, async (t) => {
	const now = Date.now()
	const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
	t.onTestFinished(() => clock.mockRestore())
	const directory = await mkdtemp(join(tmpdir(), 'recasaos-files-accounts-'))
	t.onTestFinished(() => rm(directory, { recursive: true, force: true }))
	const assetsDirectory = join(directory, 'assets')
	await mkdir(assetsDirectory)
	await writeFile(join(assetsDirectory, 'index.html'), '<title>Files</title>')
	const options = { assetsDirectory, directory: join(directory, 'data'), setupCode: 'first-run-test-code' }
	const { origin, server } = await startServer(options, t)
	const status = target => apiRequest(target, '/v1/auth/session').then(response => response.json())
	const login = (user, code) => submit(origin, '/v1/auth/login', { ...user, code })
	const manageUsers = '/v1/auth/users'
	const listFiles = '/v1/folder?path=/DATA'
	const secondFactor = '/v1/users/2fa/'
	const setup = '/v1/auth/setup'
	const accountsPath = join(options.directory, '.files-state', 'accounts.json')
	const member = { username: 'Member', password: 'member test passphrase' }
	const makeMember = { ...member, role: 'member' }
	assert.deepEqual((await status(origin)).data, { needsSetup: true, setupCodeRequired: true, user: null })
	for (const path of [listFiles, '/v3/file?path=/DATA/a.txt', '/v1/batch?path=/DATA/a.txt', manageUsers])
		assert.equal((await apiRequest(origin, path)).status, 401)
	assert.equal((await apiRequest(origin, '/v2/casaos/file/upload', { method: 'POST' })).status, 401)
	assert.equal((await submit(origin, setup, account)).status, 403)
	const setupBody = { ...account, setupCode: options.setupCode }
	const both = await Promise.all([submit(origin, setup, setupBody), submit(origin, setup, setupBody)])
	const administrator = both.find(response => response.status === 200)
	assert.equal(both.find(response => response !== administrator).status, 409)
	const adminCookie = cookieOf(administrator)
	assert.match(administrator.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/)
	assert.equal((await apiRequest(origin, manageUsers, { method: 'POST', body: makeMember, cookie: adminCookie, headers: { origin: 'https://other.test' } })).status, 403)
	assert.equal((await submit(origin, manageUsers, makeMember, adminCookie)).status, 200)
	assert.equal((await submit(origin, manageUsers, { ...makeMember, username: 'MEMBER' }, adminCookie)).status, 409)
	assert.equal((await submit(origin, manageUsers, { username: 'admin' }, adminCookie, 'DELETE')).status, 400)
	assert.equal((await login({ ...member, password: 'wrong' })).status, 401)
	let memberCookie = cookieOf(await login({ ...member, username: 'MEMBER' }))
	assert.ok(memberCookie)
	assert.equal((await apiRequest(origin, listFiles, { cookie: memberCookie })).status, 200)
	assert.equal((await apiRequest(origin, manageUsers, { cookie: memberCookie })).status, 403)
	assert.equal((await submit(origin, manageUsers, { ...makeMember, username: 'other' }, memberCookie)).status, 403)
	assert.equal((await submit(origin, `${secondFactor}enable`, { code: '000000' }, memberCookie)).status, 410)
	const { data: enrollment } = await (await submit(origin, `${secondFactor}setup`, { password: member.password }, memberCookie)).json()
	assert.match(enrollment.otpauth_url, /^otpauth:\/\/totp\//)
	const enabled = await submit(origin, `${secondFactor}enable`, { code: totpCode(enrollment.secret, Date.now() - 30_000) }, memberCookie)
	assert.equal(enabled.status, 200)
	const previousCookie = memberCookie
	memberCookie = cookieOf(enabled)
	const { data: { recovery_codes: recoveryCodes } } = await enabled.json()
	assert.equal(recoveryCodes.length, 8)
	assert.equal((await apiRequest(origin, listFiles, { cookie: previousCookie })).status, 401)
	assert.equal((await apiRequest(origin, listFiles, { cookie: memberCookie })).status, 200)
	const challenge = await login(member)
	assert.equal(cookieOf(challenge), undefined)
	assert.deepEqual((await challenge.json()).data, { requiresCode: true })
	const code = totpCode(enrollment.secret, Date.now())
	assert.equal((await login(member, code)).status, 200)
	assert.equal((await login(member, code)).status, 401)
	const usedRecovery = await login(member, recoveryCodes[0])
	const recoveryCookie = cookieOf(usedRecovery)
	assert.ok(recoveryCookie)
	assert.equal((await login(member, recoveryCodes[0])).status, 401)
	assert.equal((await submit(origin, '/v1/auth/logout', undefined, recoveryCookie)).status, 200)
	assert.equal((await apiRequest(origin, listFiles, { cookie: recoveryCookie })).status, 401)
	const newPassword = 'another member passphrase'
	assert.equal((await submit(origin, `${manageUsers}/password`, { username: member.username, password: newPassword }, adminCookie, 'PUT')).status, 200)
	assert.equal((await apiRequest(origin, listFiles, { cookie: memberCookie })).status, 401)
	assert.equal((await login(member, recoveryCodes[1])).status, 401)
	const serialized = await readFile(accountsPath, 'utf8')
	for (const secret of [account.password, member.password, newPassword, recoveryCodes[1]])
		assert.ok(!serialized.includes(secret))
	await new Promise(resolve => server.close(resolve))
	const { origin: restarted } = await startServer(options, t)
	assert.equal((await status(restarted)).data.needsSetup, false)
	assert.equal((await apiRequest(restarted, listFiles, { cookie: adminCookie })).status, 401)
	assert.equal((await submit(restarted, '/v1/auth/login', { username: member.username, password: newPassword, code: recoveryCodes[0] })).status, 401)
	const signedInAgain = await submit(restarted, '/v1/auth/login', { username: member.username, password: newPassword, code: recoveryCodes[1] })
	assert.equal(signedInAgain.status, 200)
	const signedInAdmin = cookieOf(await submit(restarted, '/v1/auth/login', account))
	const rotated = await submit(restarted, '/v1/auth/password', { currentPassword: account.password, password: 'rotated admin passphrase' }, signedInAdmin, 'PUT')
	assert.equal(rotated.status, 200)
	assert.equal((await apiRequest(restarted, listFiles, { cookie: signedInAdmin })).status, 401)
	const rotatedAdmin = cookieOf(rotated)
	assert.equal((await submit(restarted, `${manageUsers}/2fa`, { username: member.username }, rotatedAdmin, 'DELETE')).status, 200)
	assert.equal((await apiRequest(restarted, listFiles, { cookie: cookieOf(signedInAgain) })).status, 401)
	const afterFactorReset = cookieOf(await submit(restarted, '/v1/auth/login', { username: member.username, password: newPassword }))
	assert.ok(afterFactorReset)
	assert.equal((await submit(restarted, manageUsers, { username: member.username }, rotatedAdmin, 'DELETE')).status, 200)
	assert.equal((await apiRequest(restarted, listFiles, { cookie: afterFactorReset })).status, 401)
	const incorrectLogin = () => submit(restarted, '/v1/auth/login', { username: 'nonexistent-account' })
	for (let attempt = 0; attempt < 12; attempt++)
		assert.equal((await incorrectLogin()).status, 401)
	assert.equal((await incorrectLogin()).status, 429)
})
