// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import StandaloneMountList from './StandaloneMountList.vue'

afterEach(() => localStorage.clear())

it('reorders mounts independently of pins, restores their order, and opens them', async () => {
	const pinOrderKey = 'casaos-files-sidebar-order'
	const mountOrderKey = 'casaos-files-mount-order'
	localStorage.setItem(pinOrderKey, JSON.stringify(['/DATA/Documents']))
	localStorage.setItem(mountOrderKey, JSON.stringify(['/DATA/Offline', '/DATA', '/DATA/Archive']))
	const getFileList = vi.fn()
	const options = {
		props: { paths: ['/DATA', '/DATA/Archive'], isActive: true },
		global: {
			provide: { filePanel: { getFileList, rootPath: '/DATA' } },
			mocks: { $store: { state: { currentPath: '/DATA' } }, $t: text => text },
			stubs: { BIcon: true },
		},
	}
	const wrapper = mount(StandaloneMountList, options)

	expect(wrapper.findAll('.mount-point').map(row => row.text())).toEqual(['DATA', 'Archive'])
	expect(wrapper.findAll('b-icon-stub').map(icon => icon.attributes('icon'))).toEqual(['storage-other', 'storage-other'])
	await wrapper.get('.mount-point').trigger('keydown.down', { key: 'ArrowDown', altKey: true })
	expect(wrapper.findAll('.mount-point').map(row => row.text())).toEqual(['Archive', 'DATA'])
	await wrapper.get('.mount-point').trigger('keydown.enter', { key: 'Enter' })
	expect(getFileList).toHaveBeenCalledWith('/DATA/Archive')
	expect(JSON.parse(localStorage.getItem(pinOrderKey))).toEqual(['/DATA/Documents'])
	wrapper.unmount()

	const reopened = mount(StandaloneMountList, {
		...options,
		props: { ...options.props, paths: [...options.props.paths, '/DATA/Offline'] },
	})
	expect(reopened.findAll('.mount-point').map(row => row.text())).toEqual(['Offline', 'Archive', 'DATA'])
	reopened.unmount()
})
