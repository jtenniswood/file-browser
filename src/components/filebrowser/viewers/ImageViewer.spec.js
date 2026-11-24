// @vitest-environment happy-dom
import { shallowMount } from '@vue/test-utils'
import { expect, it } from 'vitest'
import ImageViewer from './ImageViewer.vue'

it('opens AVIF images and keeps them in the image viewer navigation', () => {
	const jpeg = { name: 'first.jpg', path: '/DATA/first.jpg' }
	const avif = { name: 'photo.AVIF', path: '/DATA/photo.AVIF' }
	const text = { name: 'notes.txt', path: '/DATA/notes.txt' }
	const folder = { name: 'folder.avif', path: '/DATA/folder.avif', is_dir: true }
	const previousKeyHandler = window.onkeyup
	const wrapper = shallowMount(ImageViewer, {
		props: { item: avif, list: [jpeg, text, avif, folder] },
		global: { mocks: { $standaloneFiles: true, $t: key => key } },
	})

	try {
		expect(wrapper.vm.getPanelType(avif)).toBe('image-viewer')
		expect(wrapper.vm.currentItemArray).toEqual(['/v3/file?path=%2FDATA%2Fphoto.AVIF'])
		expect(wrapper.vm.disableNext).toBe(true)
		wrapper.vm.prev()
		expect(wrapper.vm.currentItem.name).toBe(jpeg.name)
		wrapper.vm.next()
		expect(wrapper.vm.currentItem.name).toBe(avif.name)
	} finally {
		wrapper.unmount()
		window.onkeyup = previousKeyHandler
	}
})
