import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { isIP } from 'node:net'
import { basename, extname, resolve, sep } from 'node:path'
import process from 'node:process'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { openAccounts } from './accounts.mjs'
import { RequestError, openStorage, rootPath } from './storage.mjs'

const assetTypes = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.otf': 'font/otf',
	'.eot': 'application/vnd.ms-fontobject',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.ico': 'image/x-icon',
}
const previewTypes = {
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.bmp': 'image/bmp',
	'.tiff': 'image/tiff',
	'.svg': 'image/svg+xml',
	'.mp4': 'video/mp4',
	'.m4v': 'video/mp4',
	'.webm': 'video/webm',
	'.mov': 'video/quicktime',
	'.mp3': 'audio/mpeg',
	'.aac': 'audio/aac',
	'.m4a': 'audio/mp4',
	'.flac': 'audio/flac',
	'.wav': 'audio/wav',
	'.ogg': 'audio/ogg',
	'.opus': 'audio/ogg',
	'.pdf': 'application/pdf',
	'.srt': 'text/plain',
	'.ass': 'text/plain',
	'.vtt': 'text/vtt',
}
const octet = 'application/octet-stream'
const jsonLimit = 16 * 1024 * 1024
const editLimit = 8 * 1024 * 1024
const localHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i

function json(response, status, data) {
	response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
	response.end(JSON.stringify(status === 200 ? { success: 200, data } : { success: status, data, message: data }))
}

async function bodyOf(request, limit = jsonLimit) {
	if (Number(request.headers['content-length']) > limit)
		throw new RequestError(413, 'The request is too large.')
	const chunks = []
	let bytes = 0
	for await (const chunk of request.iterator({ destroyOnReturn: false })) {
		bytes += chunk.length
		if (bytes > limit)
			throw new RequestError(413, 'The request is too large.')
		chunks.push(chunk)
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString('utf8'))
	} catch {
		throw new RequestError(400, 'The request needs a JSON body.')
	}
}

function ipHostname(address) {
	const family = isIP(address)
	if (!family || address.includes('%'))
		return ''
	const { hostname } = new URL(`http://${family === 6 ? `[${address}]` : address}`)
	return hostname === '0.0.0.0' || hostname === '[::]' ? '' : hostname
}

function isAllowedRequest(request, pathname, directHost, publicOrigin) {
	const { host, origin, 'sec-fetch-site': site, 'sec-fetch-dest': destination } = request.headers
	const authority = host?.toLowerCase() || ''
	const usesPublicOrigin = authority === publicOrigin?.host
	const usesDirectHost = directHost && authority.replace(/:\d{1,5}$/, '') === directHost
	if (!usesPublicOrigin && !usesDirectHost && !localHost.test(authority))
		return false
	// A link or an authentication proxy can navigate to the app's entry page.
	if (destination === 'document' && request.method === 'GET' && pathname === '/')
		return !origin
	if (site === 'none' && ['GET', 'HEAD'].includes(request.method))
		return !origin
	const expectedOrigin = usesPublicOrigin ? publicOrigin.origin : `http://${authority}`
	return (!site || site === 'same-origin') && (!origin || origin === expectedOrigin)
}

function attachment(name) {
	return `attachment; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16)}`)}`
}

function byteRange(header, size) {
	const match = /^bytes=(\d*)-(\d*)$/.exec(header)
	if (!match || !size || (!match[1] && !match[2]))
		return
	const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
	const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1
	if (Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end)
		return { start, end }
}

async function sendFile(store, request, response, path, { download = false, text = false } = {}) {
	const file = await store.openFile(path)
	try {
		const info = await file.stat()
		if (!info.isFile())
			throw new RequestError(403, 'Choose a regular file.')
		if (text && info.size > editLimit)
			throw new RequestError(413, 'This file is too large to open in the editor.')
		const type = text ? 'text/plain; charset=utf-8' : previewTypes[extname(path).toLowerCase()] || octet
		response.setHeader('Content-Security-Policy', 'sandbox; default-src \'none\'')
		response.setHeader('Content-Type', type)
		if (download || type === octet)
			response.setHeader('Content-Disposition', attachment(basename(path)))
		response.setHeader('Accept-Ranges', 'bytes')
		let length = info.size
		let range
		if (request.headers.range && !text) {
			range = byteRange(request.headers.range, info.size)
			if (!range) {
				response.writeHead(416, { 'Content-Range': `bytes */${info.size}` })
				response.end()
				return
			}
			length = range.end - range.start + 1
			response.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${info.size}`)
		}
		response.writeHead(range ? 206 : 200, { 'Content-Length': length })
		if (request.method === 'HEAD' || length === 0) {
			response.end()
		} else {
			await pipeline(file.createReadStream({ ...range, autoClose: false }), response)
		}
	} finally {
		await file.close()
	}
}

async function sendArchive(store, response, paths) {
	const entries = await store.archivePaths(paths)
	const input = Buffer.from(`${entries.join('\0')}\0`)
	const tar = spawn('tar', ['-czf', '-', '-C', store.root, '--null', '-T', '-'], { stdio: ['pipe', 'pipe', 'ignore'] })
	const finished = new Promise((resolve, reject) => {
		tar.once('error', reject)
		tar.once('close', code => code === 0 ? resolve() : reject(new Error(`Archive failed with exit code ${code}.`)))
	})
	tar.stdin.on('error', () => {})
	tar.stdin.end(input)
	response.setHeader('Content-Type', 'application/gzip')
	response.setHeader('Content-Disposition', attachment('files.tar.gz'))
	try {
		await Promise.all([pipeline(tar.stdout, response, { end: false }), finished])
		response.end()
	} finally {
		tar.kill()
	}
}

async function serveStatic(request, response, pathname, assets) {
	if (request.method !== 'GET' && request.method !== 'HEAD')
		throw new RequestError(405, 'Method not allowed.')
	if (pathname === '/')
		pathname = '/index.html'
	const filename = resolve(assets, `.${decodeURIComponent(pathname)}`)
	if (!filename.startsWith(`${assets}${sep}`))
		throw new RequestError(404, 'Page not found.')
	const info = await stat(filename)
	if (!info.isFile())
		throw new RequestError(404, 'Page not found.')
	response.setHeader('Content-Type', assetTypes[extname(filename)] || octet)
	if (/\.[0-9a-f]{8}\./.test(basename(filename)))
		response.setHeader('Cache-Control', 'private, max-age=31536000, immutable')
	if (pathname === '/index.html')
		response.setHeader('X-Frame-Options', 'DENY')
	response.writeHead(200, { 'Content-Length': info.size })
	if (request.method === 'HEAD')
		response.end()
	else
		await pipeline(createReadStream(filename), response)
}

function positiveInteger(value, label, fallback) {
	const number = value === undefined ? fallback : Number(value)
	if (!Number.isSafeInteger(number) || number < 1)
		throw new Error(`${label} must be a positive integer.`)
	return number
}

export async function createFilesServer({
	assetsDirectory,
	directory,
	directAddress,
	publicOrigin,
	setupCode,
	onSetupCode,
	maxUploadBytes = 10 * 1024 ** 3,
}) {
	const directHost = directAddress && ipHostname(directAddress)
	if (directAddress && !directHost)
		throw new Error('Set FILES_BIND_ADDRESS to a specific IP address.')
	const publicUrl = publicOrigin && new URL(publicOrigin)
	if (publicUrl && (publicUrl.protocol !== 'https:' || publicUrl.href !== `${publicUrl.origin}/`))
		throw new Error('Set FILES_PUBLIC_ORIGIN to an HTTPS origin such as https://files.example.com.')
	const assets = await realpath(assetsDirectory).catch(() => null)
	if (!assets || !(await stat(resolve(assets, 'index.html')).catch(() => null))?.isFile())
		throw new Error('Build the frontend with pnpm build:files before starting Files.')
	const store = await openStorage(directory)
	await store.trash()
	const accounts = await openAccounts(store.state, setupCode)
	if (setupCode && accounts.setupRequired())
		onSetupCode?.(setupCode)

	return createServer({ requestTimeout: 3600000 }, async (request, response) => {
		response.setHeader('Cache-Control', 'no-store')
		response.setHeader('X-Content-Type-Options', 'nosniff')
		response.setHeader('Referrer-Policy', 'no-referrer')
		response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
		try {
			const url = new URL(request.url, 'http://files.invalid')
			const { pathname, searchParams } = url
			const method = request.method
			if (method === 'GET' && pathname === '/healthz')
				return json(response, 200, 'ok')

			if (!isAllowedRequest(request, pathname, directHost, publicUrl))
				throw new RequestError(403, 'Open the configured Files address directly.')

			const route = `${method} ${pathname}`
			if (pathname.startsWith('/v1/auth/') || pathname.startsWith('/v1/users/2fa/')) {
				let body
				if (['POST', 'PUT', 'DELETE'].includes(method) && route !== 'POST /v1/auth/logout') {
					if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || ''))
						throw new RequestError(415, 'Send account changes as JSON.')
					body = await bodyOf(request, 4096)
				}
				const secure = publicUrl && request.headers.host?.toLowerCase() === publicUrl.host
				return json(response, 200, await accounts.handle(route, body, request, response, secure))
			}
			if (/^\/v\d+\//.test(pathname) && !accounts.user(request))
				throw new RequestError(401, 'Sign in to File Browser.')

			const path = searchParams.get('path')
			let data = null
			switch (route) {
				case 'GET /v1/file/roots':
					data = { roots: [rootPath], writable: [rootPath] }
					break
				case 'GET /v1/folder':
					data = await store.list(path)
					break
				case 'POST /v1/file':
				case 'POST /v1/folder':
					await store.create((await bodyOf(request))?.path, pathname === '/v1/folder')
					break
				case 'PUT /v1/folder/icon': {
					const body = await bodyOf(request, 4096)
					await store.setFolderIcon(body?.path, body?.icon)
					break
				}
				case 'PUT /v1/file/name':
				case 'PUT /v1/folder/name': {
					const body = await bodyOf(request)
					await store.rename(body?.old_path, body?.new_path)
					break
				}
				case 'PUT /v1/file': {
					const body = await bodyOf(request)
					if (typeof body?.content === 'string' && Buffer.byteLength(body.content) > editLimit)
						throw new RequestError(413, 'The edited file exceeds the editor size limit.')
					await store.update(body?.path, body?.content)
					break
				}
				case 'GET /v1/file':
				case 'GET /v1/file/content':
					return await sendFile(store, request, response, path, { text: true })
				case 'HEAD /v3/file':
				case 'GET /v3/file':
				case 'GET /v1/image':
					return await sendFile(store, request, response, path, { download: searchParams.has('download') })
				case 'GET /v1/batch':
					return await sendArchive(store, response, searchParams.getAll('path'))
				case 'POST /v1/batch/task':
					await store.batchTask((await bodyOf(request)) || {})
					break
				case 'DELETE /v1/batch':
					await store.remove(await bodyOf(request), searchParams.get('to_trash') === 'true')
					break
				case 'GET /v1/file/trash':
					data = await store.trash()
					break
				case 'POST /v1/file/trash/restore':
				case 'DELETE /v1/file/trash':
					data = await store.editTrash(await bodyOf(request), method === 'POST')
					break
				case 'DELETE /v1/file/trash/all':
					await store.emptyTrash()
					break
				case 'GET /v1/users/current/custom/shortcut':
					data = await store.shortcuts()
					break
				case 'POST /v1/users/current/custom/shortcut':
					data = await store.setShortcuts(await bodyOf(request))
					break
				case 'POST /v2/casaos/file/upload': {
					if (Number(request.headers['content-length']) > maxUploadBytes)
						throw new RequestError(413, 'The upload exceeds the size limit.')
					if (searchParams.get('totalChunks') !== '1' || searchParams.get('chunkNumber') !== '1')
						throw new RequestError(400, 'The upload must be sent as a single request.')
					await store.upload(path, searchParams.get('relativePath'), request, maxUploadBytes)
					break
				}
				default:
					if (/^\/v\d+\//.test(pathname))
						throw new RequestError(404, 'The requested Files endpoint is unavailable.')
					return await serveStatic(request, response, pathname, assets)
			}
			json(response, 200, data)
		} catch (error) {
			if (response.headersSent) {
				response.destroy()
				return
			}
			const known = {
				ENOENT: [404, 'The file or folder was not found.'],
				EEXIST: [409, 'A file or folder already has that name.'],
				EACCES: [403, 'The server cannot access that file or folder.'],
				EPERM: [403, 'The server cannot change that file or folder.'],
				EROFS: [403, 'The server folder is read-only.'],
				ENOSPC: [507, 'The server disk is full.'],
				EXDEV: [409, 'The destination must be on the same filesystem.'],
			}
			const [status, message] = error instanceof RequestError
				? [error.status, error.message]
				: known[error.code] || [500, 'The server could not complete that request.']
			if (status === 500 && !request.aborted)
				console.error(error)
			response.removeHeader('Content-Disposition')
			response.removeHeader('Content-Security-Policy')
			json(response, status, message)
			request.resume()
		}
	})
}

async function start() {
	const env = process.env
	const host = env.FILES_HOST || env.FILES_BIND_ADDRESS || '127.0.0.1'
	const port = positiveInteger(env.FILES_PORT, 'FILES_PORT', 8080)
	if (port > 65535)
		throw new Error('FILES_PORT must be between 1 and 65535.')
	const directAddress = env.FILES_BIND_ADDRESS || (ipHostname(host) ? host : undefined)
	const setupCode = env.FILES_PUBLIC_ORIGIN || !localHost.test(ipHostname(directAddress)) ? randomBytes(16).toString('hex') : undefined
	const server = await createFilesServer({
		assetsDirectory: fileURLToPath(new URL('../build/file-browser', import.meta.url)),
		directory: env.FILES_DIRECTORY || './files-data',
		directAddress,
		publicOrigin: env.FILES_PUBLIC_ORIGIN,
		setupCode,
		onSetupCode: code => process.stdout.write(`File Browser setup code: ${code}\n`),
		maxUploadBytes: positiveInteger(env.FILES_MAX_UPLOAD_BYTES, 'FILES_MAX_UPLOAD_BYTES', 10 * 1024 ** 3),
	})
	server.listen(port, host, () => console.log(`Files is listening on http://${host}:${port}`))
	for (const signal of ['SIGINT', 'SIGTERM'])
		process.once(signal, () => server.close())
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	start().catch((error) => {
		console.error(error.message)
		process.exitCode = 1
	})
}
