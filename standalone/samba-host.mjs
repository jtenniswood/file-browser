import { createServer } from 'node:net'
import process from 'node:process'
import { sambaInventory } from './samba.mjs'

const { FILES_DIRECTORY, FILES_SAMBA_CONFIG, FILES_SAMBA_SOCKET } = process.env
if (!FILES_DIRECTORY || !FILES_SAMBA_SOCKET || process.getuid() === 0)
	throw new Error('Run the Samba helper as the Files user and set FILES_DIRECTORY and FILES_SAMBA_SOCKET.')

// The container connects as the same numeric user. Other users cannot read the inventory.
process.umask(0o177)
const inventory = sambaInventory(FILES_DIRECTORY, FILES_SAMBA_CONFIG)
const server = createServer(async (socket) => {
	socket.on('error', () => {})
	socket.resume()
	try {
		socket.end(JSON.stringify(await inventory()))
	} catch {
		console.error('Could not read the host Samba configuration. Check FILES_SAMBA_CONFIG and testparm access.')
		socket.end()
	}
})
server.listen(FILES_SAMBA_SOCKET)
for (const signal of ['SIGINT', 'SIGTERM'])
	process.once(signal, () => server.close())
