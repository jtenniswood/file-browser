import { createRouter, createWebHashHistory } from 'vue-router'
import FilesTab from '@/views/FilesTab.vue'
import StandaloneFilesSettings from '@/views/StandaloneFilesSettings.vue'

export default createRouter({
	history: createWebHashHistory(),
	routes: [
		{ path: '/files', name: 'files', component: FilesTab },
		// Load Settings with Files so an open tab can still navigate there
		// after a deployment replaces the previous build's assets.
		{ path: '/settings', name: 'settings', component: StandaloneFilesSettings },
		{ path: '/:pathMatch(.*)*', redirect: to => ({ name: 'files', query: to.query }) },
	],
})
