import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { createHmac, scryptSync } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it, vi } from 'vitest'
import { createFilesServer } from './server.mjs'
import { mountedPaths } from './storage.mjs'
import { acceptedStep } from './totp.mjs'

const account = { password: 'initial test passphrase' }
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

it('finds mount points inside the data directory and decodes their names', () => {
	const mountInfo = [
		'99 1 0:1 /host /data rw - ext4 /dev/root rw',
		'100 99 0:1 /work /data/Work rw - ext4 /dev/root rw',
		'101 99 0:2 / /data/Media\\040Drive rw - ext4 /dev/media rw',
		'102 99 0:3 / /data/Work/Archive rw - ext4 /dev/archive rw',
		'103 99 0:4 / /data/Work/Archive rw - tmpfs tmpfs rw',
		'104 1 0:5 / /data-other/Outside rw - tmpfs tmpfs rw',
	].join('\n')
	assert.deepEqual(mountedPaths(mountInfo, '/data'), ['/DATA/Media Drive', '/DATA/Work', '/DATA/Work/Archive'])
	assert.deepEqual(mountedPaths(mountInfo, '/data', []), ['/DATA'])
	assert.deepEqual(mountedPaths(mountInfo, '/data', ['/data/Media Drive', '/data/Documents']), ['/DATA', '/DATA/Media Drive'])
	assert.deepEqual(mountedPaths('', '/data', []), [])
})

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
	const state = join(dataDirectory, '.files-state')
	const previousEntry = join(state, 'e8dfcc3c-d292-478a-9d8f-fb961b52958c')
	await mkdir(previousEntry, { recursive: true })
	await writeFile(join(previousEntry, 'entry.json'), JSON.stringify({ path: '/DATA/old.txt', deleted_at: '2020-01-01T00:00:00Z' }))
	await writeFile(join(previousEntry, 'data'), 'previously deleted file')
	const options = { assetsDirectory, directory: dataDirectory, maxUploadBytes: 64 }
	const { origin } = await startServer(options, t)
	assert.equal((await fetch(`${origin}/v1/folder?path=/DATA`)).status, 401)
	assert.equal((await apiRequest(origin, '/v1/file/roots')).status, 401)
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
	assert.deepEqual((await (await request('/v1/file/roots')).json()).data, {
		roots: ['/DATA'],
		writable: ['/DATA'],
		mount_points: ['/DATA'],
	})
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

	await writeFile(join(dataDirectory, 'Docs/photo.AVIF'), 'image bytes')
	const preview = await request('/v3/file?path=/DATA/Docs/photo.AVIF')
	assert.equal(preview.headers.get('content-type'), 'image/avif')
	assert.equal(preview.headers.get('content-disposition'), null)
	assert.equal(await preview.text(), 'image bytes')
	assert.match((await request('/v3/file?path=/DATA/Docs/photo.AVIF&download=1', 'HEAD')).headers.get('content-disposition'), /^attachment/)

	const model = Buffer.alloc(134)
	model.writeUInt32LE(1, 80)
	await writeFile(join(dataDirectory, 'Docs/model.STL'), model)
	const modelPreview = await request('/v3/file?path=/DATA/Docs/model.STL')
	assert.equal(modelPreview.headers.get('content-type'), 'model/stl')
	assert.equal(modelPreview.headers.get('content-disposition'), null)
	assert.deepEqual(Buffer.from(await modelPreview.arrayBuffer()), model)
	assert.match((await request('/v3/file?path=/DATA/Docs/model.STL&download=1', 'HEAD')).headers.get('content-disposition'), /^attachment/)

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

	assert.equal((await request('/v1/batch?to_trash=true', 'DELETE', ['/DATA/Docs'])).status, 400)
	assert.equal((await request('/v1/batch', 'DELETE', ['/DATA/Docs', '/DATA'])).status, 403)
	assert.equal(await readFile(join(dataDirectory, 'Docs/renamed.txt'), 'utf8'), 'hello')
	const stateBeforeDeletion = await readdir(state)
	assert.equal((await request('/v1/batch', 'DELETE', ['/DATA/Docs', '/DATA/Docs/renamed.txt', '/DATA/Photos'])).status, 200)
	assert.deepEqual(await list(), [])
	assert.deepEqual(await readdir(state), stateBeforeDeletion)
	assert.equal(await readFile(join(previousEntry, 'data'), 'utf8'), 'previously deleted file')
	assert.equal((await request('/v1/file/trash')).status, 404)
})

it('explains permission failures when creating or moving a folder', {
	skip: process.platform === 'win32' || process.getuid?.() === 0,
	timeout: 15000,
}, async (t) => {
	const directory = await mkdtemp(join(tmpdir(), 'recasaos-files-permissions-'))
	const assetsDirectory = join(directory, 'assets')
	const dataDirectory = join(directory, 'data')
	const destination = join(dataDirectory, 'Syncthing')
	await mkdir(assetsDirectory)
	await writeFile(join(assetsDirectory, 'index.html'), '<title>Files</title>')
	await mkdir(join(dataDirectory, 'New folder'), { recursive: true })
	await mkdir(destination, { mode: 0o555 })
	t.onTestFinished(async () => {
		await chmod(destination, 0o755)
		await rm(directory, { recursive: true, force: true })
	})
	const { origin } = await startServer({ assetsDirectory, directory: dataDirectory }, t)
	const cookie = cookieOf(await submit(origin, '/v1/auth/setup', account))
	assert.ok(cookie)

	const create = await submit(origin, '/v1/folder', { path: '/DATA/Syncthing/test' }, cookie)
	assert.equal(create.status, 403)
	assert.equal((await create.json()).message, 'Files could not create a folder in “/DATA/Syncthing”. Check that the Files service account has write access to this folder on the server.')

	const move = await submit(origin, '/v1/batch/task', {
		type: 'move',
		item: [{ from: '/DATA/New folder' }],
		to: '/DATA/Syncthing',
	}, cookie)
	assert.equal(move.status, 403)
	assert.equal((await move.json()).message, 'Files could not move the selection to “/DATA/Syncthing”. Check that the Files service account has write access to the source and destination folders on the server.')
	assert.deepEqual(await readdir(destination), [])
	assert.deepEqual(await readdir(join(dataDirectory, 'New folder')), [])
})

it('saves a folder icon across renames, moves and server restarts', async (t) => {
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

it('protects the default account and preserves the original administrator on upgrade', { timeout: 20_000 }, async (t) => {
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
	const login = (target, code) => submit(target, '/v1/auth/login', { ...account, code })
	const manageUsers = '/v1/auth/users'
	const listFiles = '/v1/folder?path=/DATA'
	const secondFactor = '/v1/users/2fa/'
	const setup = '/v1/auth/setup'
	const accountsPath = join(options.directory, '.files-state', 'accounts.json')
	const member = { username: 'Member', password: 'member test passphrase' }
	assert.deepEqual((await status(origin)).data, { needsSetup: true, setupCodeRequired: true, user: null })
	for (const path of [listFiles, '/v3/file?path=/DATA/a.txt', '/v1/batch?path=/DATA/a.txt', manageUsers])
		assert.equal((await apiRequest(origin, path)).status, 401)
	assert.equal((await apiRequest(origin, '/v2/casaos/file/upload', { method: 'POST' })).status, 401)
	assert.equal((await submit(origin, setup, account)).status, 403)
	const setupBody = { ...account, setupCode: options.setupCode }
	const both = await Promise.all([submit(origin, setup, setupBody), submit(origin, setup, setupBody)])
	const setupResponse = both.find(response => response.status === 200)
	assert.equal(both.find(response => response !== setupResponse).status, 409)
	let ownerCookie = cookieOf(setupResponse)
	assert.match(setupResponse.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/)
	assert.deepEqual((await setupResponse.json()).data.user, { username: 'admin', totp_enabled: false })
	assert.equal((await apiRequest(origin, listFiles, { cookie: ownerCookie })).status, 200)
	assert.equal((await apiRequest(origin, manageUsers, { method: 'POST', body: member, cookie: ownerCookie, headers: { origin: 'https://other.test' } })).status, 403)
	assert.equal((await apiRequest(origin, manageUsers, { cookie: ownerCookie })).status, 404)
	assert.equal((await submit(origin, manageUsers, member, ownerCookie)).status, 404)
	assert.equal((await submit(origin, manageUsers, member, ownerCookie, 'DELETE')).status, 404)
	assert.equal((await submit(origin, manageUsers + '/password', member, ownerCookie, 'PUT')).status, 404)
	assert.equal((await submit(origin, manageUsers + '/2fa', member, ownerCookie, 'DELETE')).status, 404)
	assert.equal((await submit(origin, secondFactor + 'enable', { code: '000000' }, ownerCookie)).status, 410)
	const { data: enrollment } = await (await submit(origin, secondFactor + 'setup', account, ownerCookie)).json()
	const authenticatorUrl = new URL(enrollment.otpauth_url)
	assert.equal(authenticatorUrl.protocol, 'otpauth:')
	assert.equal(authenticatorUrl.hostname, 'totp')
	assert.equal(decodeURIComponent(authenticatorUrl.pathname), '/Files:admin')
	assert.equal(authenticatorUrl.searchParams.get('issuer'), 'Files')
	const enabled = await submit(origin, `${secondFactor}enable`, { code: totpCode(enrollment.secret, Date.now() - 30_000) }, ownerCookie)
	assert.equal(enabled.status, 200)
	const previousCookie = ownerCookie
	ownerCookie = cookieOf(enabled)
	const { data: { recovery_codes: recoveryCodes } } = await enabled.json()
	assert.equal(recoveryCodes.length, 8)
	assert.equal((await apiRequest(origin, listFiles, { cookie: previousCookie })).status, 401)
	assert.equal((await apiRequest(origin, listFiles, { cookie: ownerCookie })).status, 200)
	const challenge = await login(origin)
	assert.equal(cookieOf(challenge), undefined)
	assert.deepEqual((await challenge.json()).data, { requiresCode: true })
	const code = totpCode(enrollment.secret, Date.now())
	assert.equal((await login(origin, code)).status, 200)
	assert.equal((await login(origin, code)).status, 401)
	const usedRecovery = await login(origin, recoveryCodes[0])
	const recoveryCookie = cookieOf(usedRecovery)
	assert.ok(recoveryCookie)
	assert.equal((await login(origin, recoveryCodes[0])).status, 401)
	assert.equal((await submit(origin, '/v1/auth/logout', undefined, recoveryCookie)).status, 200)
	assert.equal((await apiRequest(origin, listFiles, { cookie: recoveryCookie })).status, 401)
	// Simulate a pre-upgrade account file with a custom owner name and both legacy roles.
	await new Promise(resolve => server.close(resolve))
	const records = JSON.parse(await readFile(accountsPath, 'utf8'))
	assert.equal(records.users.length, 1)
	records.users[0].username = 'OriginalOwner'
	const salt = '1'.repeat(32)
	const hash = scryptSync(member.password, Buffer.from(salt, 'hex'), 64, { N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 ** 2 }).toString('hex')
	records.users.push(
		{ username: member.username, password: { salt, hash }, role: 'member', totp: null },
		{ username: 'OtherAdmin', password: { salt, hash }, role: 'admin', totp: null },
	)
	await writeFile(accountsPath, JSON.stringify(records))

	const { origin: restarted } = await startServer(options, t)
	assert.equal((await status(restarted)).data.needsSetup, false)
	assert.equal((await apiRequest(restarted, listFiles, { cookie: ownerCookie })).status, 401)
	assert.equal((await submit(restarted, '/v1/auth/login', { password: member.password })).status, 401)
	assert.equal((await submit(restarted, '/v1/auth/login', { username: 'OtherAdmin', password: member.password })).status, 401)
	assert.equal((await login(restarted, recoveryCodes[0])).status, 401)
	const signedInAgain = await login(restarted, recoveryCodes[1])
	assert.equal(signedInAgain.status, 200)
	assert.deepEqual((await signedInAgain.json()).data.user, { username: 'OriginalOwner', totp_enabled: true })
	const currentCookie = cookieOf(signedInAgain)
	const newPassword = 'rotated owner passphrase'
	const rotated = await submit(restarted, '/v1/auth/password', { currentPassword: account.password, password: newPassword }, currentCookie, 'PUT')
	assert.equal(rotated.status, 200)
	assert.equal((await apiRequest(restarted, listFiles, { cookie: currentCookie })).status, 401)
	assert.equal((await submit(restarted, secondFactor + 'disable', { password: newPassword }, cookieOf(rotated))).status, 200)
	assert.equal((await submit(restarted, '/v1/auth/login', { password: newPassword })).status, 200)

	const serialized = await readFile(accountsPath, 'utf8')
	assert.deepEqual(JSON.parse(serialized).users.map(user => user.username), ['OriginalOwner'])
	for (const secret of [account.password, member.password, newPassword, recoveryCodes[1]])
		assert.ok(!serialized.includes(secret))

	clock.mockReturnValue(now + 10 * 60 * 1000)
	const incorrectLogin = () => submit(restarted, '/v1/auth/login', { password: 'wrong password' })
	for (let attempt = 0; attempt < 12; attempt++)
		assert.equal((await incorrectLogin()).status, 401)
	assert.equal((await incorrectLogin()).status, 429)
})

it('marks exact Samba share roots and refreshes them as host settings change', async (t) => {
	const directory = await mkdtemp(join(tmpdir(), 'files-samba-'))
	t.onTestFinished(() => rm(directory, { recursive: true, force: true }))
	const assetsDirectory = join(directory, 'assets')
	const dataDirectory = join(directory, 'data')
	await mkdir(assetsDirectory)
	await writeFile(join(assetsDirectory, 'index.html'), '<title>Files</title>')
	await mkdir(join(dataDirectory, 'Documents', 'Nested'), { recursive: true })
	await mkdir(join(dataDirectory, 'Documents backup'))
	await writeFile(join(dataDirectory, 'report.txt'), 'report')

	let paths = ['Documents', 'report.txt']
	const readSambaShares = vi.fn(async () => paths)
	const { origin } = await startServer({ assetsDirectory, directory: dataDirectory, readSambaShares }, t)
	const route = '/v1/folder?path=/DATA'
	assert.equal((await apiRequest(origin, route)).status, 401)
	assert.equal(readSambaShares.mock.calls.length, 0)
	const cookie = cookieOf(await submit(origin, '/v1/auth/setup', account))
	const badges = async (path = '') => {
		const response = await apiRequest(origin, route + path, { cookie })
		assert.equal(response.status, 200)
		const { data } = await response.json()
		return data.content.filter(item => item.extensions?.samba_shared).map(item => item.name)
	}

	assert.deepEqual(await badges(), ['Documents'])
	assert.deepEqual(await badges('/Documents'), [])
	paths = ['Documents/Nested']
	assert.deepEqual(await badges(), [])
	assert.deepEqual(await badges('/Documents'), ['Nested'])
	readSambaShares.mockRejectedValueOnce(new Error('Samba unavailable'))
	assert.deepEqual(await badges('/Documents'), [])
	assert.deepEqual(await badges('/Documents'), ['Nested'])
})
