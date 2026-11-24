// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import Buefy from 'buefy'
import { expect, it } from 'vitest'
import { folderIconOptions } from '../folderIcons.js'
import TreeListItem from './TreeListItem.vue'
import casaIcons from '@/plugins/casa-icons'

it('renders a distinct blue sidebar glyph for every custom folder icon', async () => {
	const item = {
		name: 'Syncthing',
		path: '/DATA/Syncthing',
		type: 'folder',
		visible: true,
		starred: true,
		icon: 'folder-outline',
		pack: 'casa',
	}
	const row = mount(TreeListItem, {
		props: { item, iconColor: 'casa-color-blue', isShare: true },
		global: {
			plugins: [[Buefy, casaIcons]],
			provide: { filePanel: {} },
		},
	})

	const glyphs = new Set()
	for (const [id] of folderIconOptions) {
		await row.setProps({ item: { ...item, entry: { folder_icon: id } } })
		const icon = row.get('.casa-color-blue i')
		const glyph = icon.classes().find(name => /^(?:casa|mdi)-(?!24px$)/.test(name))
		expect(glyph, id).toBeDefined()
		glyphs.add(glyph)
		expect(row.find('img').exists()).toBe(false)
		expect(row.get('.overlay-layer i').classes()).toContain('casa-share')
	}

	expect(glyphs.size).toBe(folderIconOptions.length)
	await row.setProps({ item: { ...item, entry: { folder_icon: 'archive' } } })
	expect(row.get('.casa-color-blue i').classes()).toContain('mdi-archive-outline')
	await row.setProps({ item: { ...item, entry: { folder_icon: 'download' } } })
	expect(row.get('.casa-color-blue i').classes()).toContain('casa-downloads-outline')
	await row.setProps({ item: { ...item, entry: { folder_icon: null } } })
	expect(row.get('.casa-color-blue i').classes()).toContain('casa-folder-outline')
})
