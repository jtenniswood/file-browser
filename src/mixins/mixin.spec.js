import { describe, expect, it, vi } from 'vitest'
import { mixin } from './mixin'

const panelOf = name => mixin.methods.getPanelType({ name })

describe('getPanelType', () => {
	// ReCasaOS/CasaOS#75 (md) and #74 (the rest, then the 2nd list) opened as a download dialog
	it.each(['README.md', 'notes.MD', 'list.m3u', 'list.m3u8', 'a.strm', 'a.nfo', 'a.vtt', 'a.properties', 'client.ovpn', 'fix.patch', 'Dockerfile', 'Makefile', '.env', 'README', 'LICENSE', 'yarn.lock', 'a.awk', 'a.cjs', 'a.desktop', 'a.gradle', 'a.jsx', 'a.lst', 'a.mjs', 'a.pls', 'a.rules', 'a.sed', 'a.socket', 'a.ssa', 'a.timer', 'a.tsx', 'a.webmanifest', 'a.xspf', 'a.pem', 'a.crt', 'a.cert', 'a.key', 'a.pub', 'a.sub'])(
		'opens %s in the code editor',
		(name) => {
			expect(panelOf(name)).toBe('code-editor')
		},
	)

	it.each(['photo.png', 'movie.mkv', 'a.pdf'])('keeps %s out of the code editor', (name) => {
		expect(panelOf(name)).not.toBe('code-editor')
	})

	it.each(['model.stl', 'model.STL'])('opens %s in the STL viewer', (name) => {
		expect(panelOf(name)).toBe('stl-viewer')
	})

	it.each(['design.psd', 'design.PSD'])('opens %s in the Photoshop viewer', (name) => {
		expect(panelOf(name)).toBe('psd-viewer')
	})

	it('keeps large Photoshop document format on the download path', () => {
		expect(panelOf('design.psb')).toBeNull()
	})

	it('offers no panel for a binary it does not know', () => {
		expect(panelOf('firmware.bin')).toBeNull()
	})
})

it('removes nested folder pins after a successful deletion and keeps similarly named folders', async () => {
	const nested = { path: '/DATA/Photos/Trips', type: 'folder' }
	const other = { path: '/DATA/Photos Backup/Trips', type: 'folder' }
	const dispatch = vi.fn()
	const reload = vi.fn()
	const context = {
		$api: { batch: { delete: vi.fn().mockResolvedValue({ data: { success: 200 } }) } },
		$refs: {},
		$store: { state: { shortcutData: [nested, other] }, dispatch },
		reload,
	}

	mixin.methods.deleteItem.call(context, { path: '/DATA/Photos' })

	await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce())
	expect(dispatch).toHaveBeenCalledExactlyOnceWith('SET_SHORTCUT_DATA', [other])
})
