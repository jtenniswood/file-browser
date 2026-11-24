import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { constants, createWriteStream } from 'node:fs'
import { access, chmod, cp, link, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, sep } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export const rootPath = '/DATA'
const stateName = '.files-state'
const retentionDays = 30
const uuidPattern = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/

export class RequestError extends Error {
	constructor(status, message) {
		super(message)
		this.status = status
	}
}

function partsOf(path) {
	if (path === rootPath)
		return []
	if (typeof path !== 'string' || !path.startsWith(`${rootPath}/`))
		throw new RequestError(403, 'Choose a path inside DATA.')
	const parts = path.slice(rootPath.length + 1).split('/')
	if (parts.some(part => !part || part === '.' || part === '..' || /[\p{Cc}\\]/u.test(part) || Buffer.byteLength(part) > 255)
		|| parts[0].toLowerCase() === stateName) {
		throw new RequestError(400, 'Invalid file path.')
	}
	return parts
}

function isSupported(stat) {
	return stat.isFile() || stat.isDirectory()
}

async function optionalStat(path) {
	try {
		return await lstat(path)
	} catch (error) {
		if (error.code !== 'ENOENT')
			throw error
	}
}

function fileDescription(path, stat) {
	return {
		name: basename(path),
		path,
		is_dir: stat.isDirectory(),
		size: stat.size,
		date: stat.mtime.toISOString(),
		write: true,
		extensions: null,
	}
}

async function inspectTree(path) {
	const stat = await lstat(path)
	if (!isSupported(stat))
		throw new RequestError(403, 'This folder contains a symbolic link or special file.')
	if (stat.isDirectory()) {
		for (const name of await readdir(path))
			await inspectTree(join(path, name))
	}
}

export async function openStorage(directory) {
	await mkdir(directory, { recursive: true, mode: 0o700 })
	const root = await realpath(directory)
	if (root === sep)
		throw new Error('FILES_DIRECTORY must be a dedicated directory.')
	await access(root, constants.R_OK | constants.W_OK | constants.X_OK)
	const state = join(root, stateName)
	try {
		await mkdir(state, { mode: 0o700 })
	} catch (error) {
		if (error.code !== 'EEXIST')
			throw error
	}
	if (!(await lstat(state)).isDirectory() || await realpath(state) !== state)
		throw new Error('The file browser state directory must be a regular directory.')
	await chmod(state, 0o700)
	for (const name of await readdir(state)) {
		// A process that stopped mid-upload can leave an uncommitted staging directory.
		if (name.startsWith('temp-'))
			await rm(join(state, name), { recursive: true, force: true })
	}

	async function locate(path, { requireEntry = true, allowRoot = true } = {}) {
		const parts = partsOf(path)
		if (!allowRoot && !parts.length)
			throw new RequestError(403, 'The DATA folder itself cannot be changed.')
		let target = root
		let stat
		for (const [index, part] of parts.entries()) {
			target = join(target, part)
			stat = await optionalStat(target)
			if (!stat && (requireEntry || index < parts.length - 1))
				throw new RequestError(404, 'The file or folder was not found.')
			if (stat && (!isSupported(stat) || (index < parts.length - 1 && !stat.isDirectory())))
				throw new RequestError(403, 'Symbolic links and special files are outside the file browser.')
		}
		if (stat && await realpath(target) !== target)
			throw new RequestError(403, 'Use the exact spelling shown in the file browser.')
		return { target, stat: parts.length ? stat : await lstat(root) }
	}

	async function list(path) {
		const { target, stat } = await locate(path)
		if (!stat.isDirectory())
			throw new RequestError(400, 'Choose a folder.')
		const content = []
		for (const name of await readdir(target)) {
			if (target === root && name.toLowerCase() === stateName)
				continue
			try {
				partsOf(`${path}/${name}`)
			} catch {
				continue
			}
			let child
			try {
				child = await optionalStat(join(target, name))
			} catch (error) {
				if (error.code === 'EACCES' || error.code === 'EPERM')
					continue
				throw error
			}
			if (child && isSupported(child))
				content.push(fileDescription(`${path}/${name}`, child))
		}
		return { content }
	}

	async function openFile(path) {
		const { target, stat } = await locate(path)
		if (!stat.isFile())
			throw new RequestError(400, 'Choose a regular file.')
		return open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
	}

	async function newEntry(path) {
		const { target, stat } = await locate(path, { requireEntry: false, allowRoot: false })
		if (stat)
			throw new RequestError(409, 'A file or folder already has that name.')
		return target
	}

	let pending = Promise.resolve()
	function change(operation) {
		const result = pending.then(operation)
		pending = result.catch(() => {})
		return result
	}

	async function staged(operation) {
		const directory = await mkdtemp(join(state, 'temp-'))
		try {
			return await operation(join(directory, 'data'))
		} finally {
			await rm(directory, { recursive: true, force: true })
		}
	}

	async function upload(path, relativePath, request, maxBytes) {
		if (typeof relativePath !== 'string' || !relativePath)
			throw new RequestError(400, 'The upload is missing a file name.')
		const parts = partsOf(`${path}/${relativePath}`)
		await staged(async (temporary) => {
			let bytes = 0
			const limit = new Transform({
				transform(chunk, encoding, callback) {
					bytes += chunk.length
					if (bytes > maxBytes)
						return callback(new RequestError(413, 'The upload exceeds the size limit.'))
					callback(null, chunk)
				},
			})
			// Keep the HTTP response available for a JSON error if the upload exceeds the limit.
			request.pipe(limit)
			const abort = () => limit.destroy(new Error('Upload interrupted.'))
			request.once('aborted', abort)
			try {
				await pipeline(limit, createWriteStream(temporary, { flags: 'wx', mode: 0o600 }))
			} finally {
				request.removeListener('aborted', abort)
				request.unpipe(limit)
			}
			await change(async () => {
				const { stat } = await locate(path)
				if (!stat.isDirectory())
					throw new RequestError(400, 'Choose a folder.')
				const base = partsOf(path).length
				for (let length = base + 1; length < parts.length; length++) {
					const parent = `${rootPath}/${parts.slice(0, length).join('/')}`
					const entry = await locate(parent, { requireEntry: false })
					if (!entry.stat)
						await mkdir(entry.target)
					else if (!entry.stat.isDirectory())
						throw new RequestError(409, 'A file already has the name of an upload folder.')
				}
				await link(temporary, await newEntry(`${rootPath}/${parts.join('/')}`))
			})
		})
	}

	async function batchTask({ type, item, to }) {
		if (!['copy', 'move'].includes(type) || !Array.isArray(item) || !item.length)
			throw new RequestError(400, 'Choose files to copy or move.')
		const destination = await locate(to)
		if (!destination.stat.isDirectory())
			throw new RequestError(400, 'Choose a destination folder.')
		const entries = []
		const targets = new Set()
		for (const entry of item) {
			const { target } = await locate(entry?.from, { allowRoot: false })
			const newPath = await newEntry(`${to}/${basename(target)}`)
			if (targets.has(newPath) || newPath.startsWith(`${target}${sep}`))
				throw new RequestError(409, 'The selection conflicts with the destination folder.')
			targets.add(newPath)
			entries.push({ target, newPath })
		}
		for (const { target, newPath } of entries) {
			if (type === 'move') {
				await rename(target, newPath)
			} else {
				await inspectTree(target)
				await staged(async (temporary) => {
					await cp(target, temporary, { recursive: true, force: false, errorOnExist: true })
					await rename(temporary, newPath)
				})
			}
		}
	}

	async function trashRows() {
		const rows = []
		for (const name of await readdir(state)) {
			if (!uuidPattern.test(name))
				continue
			const directory = join(state, name)
			if (!(await lstat(directory)).isDirectory())
				continue
			const item = await optionalStat(join(directory, 'data'))
			if (!item)
				continue
			const entry = JSON.parse(await readFile(join(directory, 'entry.json'), 'utf8'))
			if (Date.now() - Date.parse(entry.deleted_at) >= retentionDays * 86400000) {
				await rm(directory, { recursive: true, force: true })
				continue
			}
			rows.push({ ...entry, name, trash: 'local', size: item.size })
		}
		return rows
	}

	async function remove(paths, toTrash) {
		if (!Array.isArray(paths) || !paths.length)
			throw new RequestError(400, 'Choose files to delete.')
		const entries = []
		for (const path of new Set(paths))
			entries.push({ path, ...await locate(path, { allowRoot: false }) })
		if (toTrash)
			await trashRows()
		for (const entry of entries) {
			if (!toTrash) {
				await rm(entry.target, { recursive: true })
				continue
			}
			const directory = join(state, randomUUID())
			await mkdir(directory, { mode: 0o700 })
			try {
				await writeFile(join(directory, 'entry.json'), JSON.stringify({
					path: entry.path,
					is_dir: entry.stat.isDirectory(),
					deleted_at: new Date().toISOString(),
				}))
				await rename(entry.target, join(directory, 'data'))
			} catch (error) {
				await rm(directory, { recursive: true, force: true })
				throw error
			}
		}
	}

	async function editTrash(references, restore) {
		if (!Array.isArray(references) || !references.length)
			throw new RequestError(400, 'Choose items in the trash.')
		const available = new Map((await trashRows()).map(row => [row.name, row]))
		const restored = []
		for (const reference of references) {
			const { name, trash } = reference || {}
			const row = available.get(name)
			if (trash !== 'local' || !row)
				throw new RequestError(404, 'That item is no longer in the trash.')
			const directory = join(state, name)
			if (restore) {
				const target = await newEntry(row.path)
				await rename(join(directory, 'data'), target)
				restored.push(row.path)
			}
			await rm(directory, { recursive: true, force: true })
			available.delete(name)
		}
		return restored
	}

	const shortcutFile = join(state, 'shortcuts.json')
	return {
		root,
		state,
		list,
		openFile,
		upload,
		async archivePaths(paths) {
			if (!paths.length)
				throw new RequestError(400, 'Choose files to download.')
			const entries = []
			for (const path of new Set(paths)) {
				const { target } = await locate(path, { allowRoot: false })
				await inspectTree(target)
				entries.push(relative(root, target))
			}
			return entries
		},
		create: (path, folder) => change(async () => {
			const target = await newEntry(path)
			if (folder)
				await mkdir(target)
			else
				await writeFile(target, '', { flag: 'wx' })
		}),
		rename: (oldPath, newPath) => change(async () => {
			const { target } = await locate(oldPath, { allowRoot: false })
			const destination = await newEntry(newPath)
			if (dirname(target) !== dirname(destination))
				throw new RequestError(400, 'A rename must stay in the same folder.')
			await rename(target, destination)
		}),
		update: (path, content) => change(async () => {
			if (typeof content !== 'string')
				throw new RequestError(400, 'The file content must be text.')
			const { target, stat } = await locate(path, { allowRoot: false })
			if (!stat.isFile())
				throw new RequestError(400, 'Choose a regular file.')
			await staged(async (temporary) => {
				await writeFile(temporary, content, { mode: stat.mode & 0o777 })
				await chmod(temporary, stat.mode & 0o777)
				await rename(temporary, target)
			})
		}),
		batchTask: task => change(() => batchTask(task)),
		remove: (paths, toTrash) => change(() => remove(paths, toTrash)),
		trash: () => change(async () => {
			const items = await trashRows()
			return { items, size: items.reduce((size, item) => size + item.size, 0), retention_days: retentionDays }
		}),
		editTrash: (items, restore) => change(() => editTrash(items, restore)),
		emptyTrash: () => change(async () => {
			const rows = await trashRows()
			for (const { name } of rows)
				await rm(join(state, name), { recursive: true, force: true })
		}),
		shortcuts: async () => (await optionalStat(shortcutFile)) ? JSON.parse(await readFile(shortcutFile, 'utf8')) : [],
		setShortcuts: items => change(async () => {
			if (!Array.isArray(items) || items.some(item => !item || typeof item.name !== 'string' || typeof item.path !== 'string'))
				throw new RequestError(400, 'Invalid starred files.')
			await staged(async (temporary) => {
				await writeFile(temporary, JSON.stringify(items))
				await rename(temporary, shortcutFile)
			})
			return items
		}),
	}
}
