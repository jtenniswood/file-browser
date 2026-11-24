import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it, vi } from 'vitest'
import { readSambaSocket, sambaInventory } from './samba.mjs'

it('maps enabled Samba shares and usershares to folders under the data root', async (t) => {
	const directory = await mkdtemp(join(tmpdir(), 'smb-'))
	t.onTestFinished(() => rm(directory, { recursive: true, force: true }))
	const root = join(directory, 'files')
	const outside = join(directory, 'files-other')
	for (const path of ['Documents', 'Team files', 'Disabled', 'Printers', '%U'])
		await mkdir(join(root, path), { recursive: true })
	await mkdir(outside)
	const config = join(directory, 'smb.conf')
	const command = vi.fn(async name => ({
		stdout: name === 'testparm'
			? `[global]
usershare max shares = 10
[Docs]
path = ${root}/Documents/
browseable = No
[Hidden]
path = ${root}/Disabled
available = No
[Print]
path = ${root}/Printers
printable = Yes
[External]
path = ${outside}
[Dynamic]
path = ${root}/%U
`
			: `[docs]
path = ${root}/Disabled
[Team]
path = ${root}/Team files
`,
	}))
	const inventory = sambaInventory(root, config, command)
	assert.deepEqual(await Promise.all([inventory(), inventory()]), [
		['Documents', 'Team files'],
		['Documents', 'Team files'],
	])
	assert.deepEqual(command.mock.calls.map(([name, args]) => [name, args]), [
		['testparm', ['-s', '-v', config]],
		['net', [`--configfile=${config}`, 'usershare', 'info', '--long']],
	])
})

it('reads a relative share inventory from a Unix socket', async (t) => {
	const directory = await mkdtemp(join(tmpdir(), 'smb-'))
	const path = join(directory, 's.sock')
	const server = createServer(socket => socket.end('["Team files","Projects/2026"]'))
	t.onTestFinished(async () => {
		await new Promise(resolve => server.close(resolve))
		await rm(directory, { recursive: true, force: true })
	})
	await new Promise((resolve, reject) => server.once('error', reject).listen(path, resolve))
	assert.deepEqual(await readSambaSocket(path), ['Team files', 'Projects/2026'])
})
