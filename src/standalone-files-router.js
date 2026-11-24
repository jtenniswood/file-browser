import { createRouter, createWebHashHistory } from 'vue-router'
import FilesTab from '@/views/FilesTab.vue'

export default createRouter({
	history: createWebHashHistory(),
	routes: [
		{ path: '/files', name: 'files', component: FilesTab },
		{ path: '/settings', redirect: to => ({ name: 'files', query: { ...to.query, settings: null } }) },
		{ path: '/:pathMatch(.*)*', redirect: to => ({ name: 'files', query: to.query }) },
	],
})
