// @vitest-environment happy-dom
import { mount, shallowMount } from '@vue/test-utils'
import { h, KeepAlive, nextTick, reactive, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FilesTab from './FilesTab.vue'

// The whole file browser comes in with FilePanel; the tab only reads its uploader.
vi.mock('@/components/filebrowser/FilePanel.vue', () => ({
	default: { name: 'FilePanel', data: () => ({ uploaderInstance: {} }), render: () => null },
}))

const tabMocks = { $t: key => key, $EventBus: { $emit: () => {} } }

function tab() {
	const upload = { running: false }
	const $router = { push: vi.fn() }
	const wrapper = shallowMount(FilesTab, {
		global: { mocks: { ...tabMocks, $store: { state: { currentPath: '' } }, $router } },
	})
	wrapper.vm.$refs.panel.uploaderInstance = { isUploading: () => upload.running }
	return { wrapper, upload, $router }
}

// true when the page asked the browser to prompt before it unloads
function unload() {
	const event = new Event('beforeunload', { cancelable: true })
	window.dispatchEvent(event)
	return event.defaultPrevented
}

afterEach(() => {
	vi.restoreAllMocks()
})

describe('files in a tab of their own', () => {
	it('shows the current folder in the title while the files tab is active', async () => {
		const state = reactive({ currentPath: '/DATA/Family Photos' })
		const showFiles = ref(true)
		document.title = 'File Browser'
		const wrapper = mount({
			render: () => h(KeepAlive, () => showFiles.value ? h(FilesTab) : null),
		}, {
			global: {
				mocks: { ...tabMocks, $store: { state } },
			},
		})

		expect(document.title).toBe('Files · Family Photos')
		state.currentPath = '/DATA/Family Photos/2026/'
		await nextTick()
		expect(document.title).toBe('Files · 2026')

		showFiles.value = false
		await nextTick()
		expect(document.title).toBe('File Browser')

		state.currentPath = '/'
		await nextTick()
		expect(document.title).toBe('File Browser')

		showFiles.value = true
		await nextTick()
		expect(document.title).toBe('Files · Root')

		wrapper.unmount()
		expect(document.title).toBe('File Browser')
	})

	it('asks before the page unloads while an upload runs, and only then', () => {
		const { wrapper, upload } = tab()
		expect(unload()).toBe(false)

		upload.running = true
		expect(unload()).toBe(true)

		wrapper.unmount()
		expect(unload()).toBe(false)
	})

	it('stays when the user keeps the tab at the prompt, and goes to the dashboard when it cannot close', () => {
		const { wrapper, upload, $router } = tab()
		// what browsers do on window.close(): the prompt first, and the user stays
		vi.spyOn(window, 'close').mockImplementation(() => unload())

		upload.running = true
		wrapper.vm.close()
		expect($router.push).not.toHaveBeenCalled()

		upload.running = false
		wrapper.vm.close()
		expect($router.push).toHaveBeenCalledWith('/')
		wrapper.unmount()
	})
})
