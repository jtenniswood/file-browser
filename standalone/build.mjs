import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const build = spawnSync(process.execPath, [
	fileURLToPath(new URL('../node_modules/@vue/cli-service/bin/vue-cli-service.js', import.meta.url)),
	'build',
	'--dest',
	'build/file-browser',
], {
	env: { ...process.env, VUE_APP_STANDALONE_FILES: '1' },
	stdio: 'inherit',
})
if (build.error)
	throw build.error
process.exitCode = build.status ?? 1
