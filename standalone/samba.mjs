import { execFile } from 'node:child_process'
import { realpath, stat } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const commandOptions = { timeout: 2000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C.UTF-8' } }
const maxInventoryBytes = 1024 * 1024

function sections(output) {
	const entries = new Map()
	let fields
	for (const line of output.split(/\r?\n/)) {
		const header = /^\s*\[([^\]]+)\]\s*$/.exec(line)
		if (header) {
			fields = new Map()
			entries.set(header[1].toLowerCase(), fields)
		} else {
			const equals = line.indexOf('=')
			if (equals > 0 && fields)
				fields.set(line.slice(0, equals).trim().toLowerCase(), line.slice(equals + 1).trim())
		}
	}
	return entries
}

export function sambaInventory(directory, config, command = run) {
	const configPath = config && resolve(config)
	let pending
	async function load() {
		const [root, { stdout }] = await Promise.all([
			realpath(directory),
			command('testparm', ['-s', '-v', ...(configPath ? [configPath] : [])], commandOptions),
		])
		const configured = sections(stdout)
		const globals = configured.get('global')
		if (!globals)
			throw new Error('Samba configuration is unavailable.')

		const paths = []
		for (const [name, fields] of configured) {
			if (!['global', 'homes', 'printers', 'ipc$', 'print$'].includes(name)
				&& fields.get('available')?.toLowerCase() !== 'no'
				&& fields.get('printable')?.toLowerCase() !== 'yes'
				&& fields.get('-valid')?.toLowerCase() !== 'no') {
				paths.push(fields.get('path'))
			}
		}
		if (Number(globals.get('usershare max shares')) > 0) {
			const args = [...(configPath ? [`--configfile=${configPath}`] : []), 'usershare', 'info', '--long']
			const usershares = await command('net', args, commandOptions).then(({ stdout }) => sections(stdout), () => new Map())
			for (const [name, fields] of usershares) {
				if (!configured.has(name))
					paths.push(fields.get('path'))
			}
		}

		const shares = new Set()
		for (const path of new Set(paths)) {
			if (!path || !isAbsolute(path) || path.includes('%'))
				continue
			const target = await realpath(path).catch(() => null)
			if (!target)
				continue
			const suffix = relative(root, target)
			if (suffix && suffix !== '..' && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix)
				&& (await stat(target).catch(() => null))?.isDirectory()) {
				shares.add(suffix)
			}
		}
		return [...shares]
	}

	return () => {
		pending ??= load().finally(() => {
			pending = undefined
		})
		return pending
	}
}

export function readSambaSocket(path) {
	return new Promise((resolve, reject) => {
		const socket = createConnection({ path })
		let output = ''
		const timeout = setTimeout(() => socket.destroy(new Error('Samba inventory timed out.')), 5000)
		socket.setEncoding('utf8')
		socket.on('data', (chunk) => {
			output += chunk
			if (output.length > maxInventoryBytes)
				socket.destroy(new Error('Samba inventory is too large.'))
		})
		socket.once('error', reject)
		socket.once('close', () => clearTimeout(timeout))
		socket.once('end', () => {
			try {
				const paths = JSON.parse(output)
				if (!Array.isArray(paths) || !paths.every(path => typeof path === 'string'))
					throw new Error('Invalid Samba inventory.')
				resolve(paths)
			} catch (error) {
				reject(error)
			}
		})
	})
}
