import { createRouter, createWebHashHistory } from 'vue-router'
import FilesTab from '@/views/FilesTab.vue'

export default createRouter({
	history: createWebHashHistory(),
	routes: [
		{ path: '/files', name: 'files', component: FilesTab },
		{ path: '/settings', name: 'settings', component: () => import('@/views/StandaloneFilesSettings.vue') },
		{ path: '/:pathMatch(.*)*', redirect: to => ({ name: 'files', query: to.query }) },
	],
})
