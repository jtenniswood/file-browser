import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it } from 'vitest'
import { createFilesServer } from './server.mjs'

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
	const server = await createFilesServer(options)
	t.onTestFinished(() => server.close())
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
	const origin = `http://127.0.0.1:${server.address().port}`
	const request = (path, method = 'GET', body, extra = {}) => fetch(origin + path, {
		method,
		headers: extra,
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

it.for([undefined, 'https://files.example.test'])('checks request hosts and origins (public origin: %s)', async (publicOrigin, t) => {
	const directory = await mkdtemp(join(tmpdir(), 'recasaos-files-local-'))
	t.onTestFinished(() => rm(directory, { recursive: true, force: true }))
	const assetsDirectory = join(directory, 'assets')
	const dataDirectory = join(directory, 'data')
	await mkdir(assetsDirectory)
	await writeFile(join(assetsDirectory, 'index.html'), '<title>Files</title>')
	const server = await createFilesServer({ assetsDirectory, directory: dataDirectory, publicOrigin })
	t.onTestFinished(() => server.close())
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
	const origin = `http://127.0.0.1:${server.address().port}`
	const route = '/v1/folder?path=/DATA'

	assert.equal((await fetch(origin, { headers: { 'sec-fetch-site': 'none' } })).status, 200)
	assert.equal((await fetch(origin + route)).status, 200)
	const requestStatus = (path, options, body) => new Promise((resolve, reject) => {
		const request = httpRequest(origin + path, options, (response) => {
			response.resume()
			resolve(response.statusCode)
		}).on('error', reject)
		request.end(body)
	})
	assert.equal(await requestStatus(route, { headers: { host: 'untrusted.test' } }), 403)
	const proxyHost = 'files.example.test'
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
