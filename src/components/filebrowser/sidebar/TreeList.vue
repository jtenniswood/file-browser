<template>
	<h4 v-if="$standaloneFiles && sidebarItems.length" class="sidebar-group-title">{{ $t('Pinned') }}</h4>
	<draggable v-if="!$standaloneFiles || sidebarItems.length" v-model="sidebarItems" :animation="180" :delay="160" :delay-on-touch-only="true"
		:prevent-on-filter="false" class="ul" filter=".sidebar-remove" ghost-class="sidebar-drag-ghost" item-key="path">
		<template #item="{ element: item }">
			<tree-list-item :hide-icon-until-hover="item.starred" :icon-label="item.starred ? $t('Remove from Starred') : ''"
				:icon-name="item.starred ? 'close-outline' : ''" :is-active="isActive"
				:is-share="checkSharevisibility(item)" :item="item" icon-color="casa-color-blue" @right-icon-click="unstar" />
		</template>
	</draggable>
</template>

<script>
import has from 'lodash/has'
import draggable from 'vuedraggable'
import { accountFolderItems, homeFolders } from '../fileRoot.js'
import TreeListItem from './TreeListItem.vue'
import { SIDEBAR_ORDER_STORAGE_KEY, checkStarred, orderSidebarItems, saveSidebarOrder, savedSidebarOrder } from './starred.js'
import { mixin } from '@/mixins/mixin'
import events from '@/events/events'

export default {
	mixins: [mixin],
	inject: ['filePanel'],
	components: {
		Draggable: draggable,
		TreeListItem,
	},
	props: {
		path: {
			type: String,
			default: '',
		},
		autoLoad: {
			type: Boolean,
			default: false,
		},
		isActive: {
			type: Boolean,
			default: true,
		},
	},
	data() {
		return {
			rootDataList: [
				{
					name: 'Root',
					icon: 'root-outline',
					pack: 'casa',
					path: '/',
					visible: true,
					selected: true,
					extensions: null,
				},
			],

			dataList: [],
			starredList: [],
			sidebarOrder: savedSidebarOrder(),
		}
	},
	computed: {
		initFolders() {
			return homeFolders(this.filePanel.rootPath || '/DATA')
		},
		// an account sees its folders, in place of Root and the home folders
		accountItems() {
			return this.filePanel.accountFolders ? accountFolderItems(this.filePanel.accountFolders.folders) : null
		},
		sidebarItems: {
			get() {
				if (this.$standaloneFiles) {
					const isPin = item => !this.filePanel.mountPoints.includes(item.path)
					return orderSidebarItems([], this.starredList.filter(isPin), this.sidebarOrder)
				}
				const folders = this.accountItems || [...this.rootDataList, ...this.dataList]
				return orderSidebarItems(folders, this.starredList, this.sidebarOrder)
			},
			set(items) {
				this.sidebarOrder = items.map(item => item.path)
				saveSidebarOrder(SIDEBAR_ORDER_STORAGE_KEY, this.sidebarOrder)
			},
		},
	},
	watch: {
		'filePanel.fileRootReady': function (ready) {
			if (ready) {
				this.getNewList()
			}
		},
		// a star added or removed anywhere (context menu, new folder, a deleted item)
		'$store.state.shortcutData': function () {
			this.refreshStarred()
		},
	},
	async created() {
		// Get the shortcut detail for the first time and save it to store
		try {
			await this.$store.dispatch('GET_SHORTCUT_DATA')
		} catch (e) {
			console.log(e)
		}
		if (this.filePanel.fileRootReady) {
			this.getNewList()
		}
	},

	mounted() {
		this.$EventBus.$on(events.RELOAD_FILE_LIST, this.getNewList)

		this.dataList = [...this.initFolders]
	},
	beforeUnmount() {
		this.$EventBus.$off(events.RELOAD_FILE_LIST, this.getNewList)
	},
	methods: {
		async getNewList() {
			if (this.accountItems) {
				this.refreshStarred()
				return
			}
			const newList = await this.$api.folder.getList(this.rootDataList[0].path)
			const dataList = await this.$api.folder.getList(this.initFolders[0].path)

			this.dataList = [...this.initFolders]
			const contactList = []
			contactList.push(...newList.data.data.content, ...dataList.data.data.content)
			this.dataList.forEach((dir) => {
				dir.visible = contactList.some(item => item.path == dir.path && item.is_dir)
				const isInArray = contactList.find(item => item.path == dir.path && item.is_dir)
				dir.extensions = isInArray ? isInArray.extensions : null
			})
			this.refreshStarred()
		},

		async refreshStarred() {
			const starred = this.$store.state.shortcutData || []
			const list = await checkStarred(starred, path => this.$api.folder.getList(path).then(res => res.data.data.content))
			// a newer refresh may have started meanwhile: only the store's current list is drawn
			if (starred === this.$store.state.shortcutData) {
				this.starredList = list
			}
		},

		unstar(item) {
			this.$store.dispatch('SET_SHORTCUT_DATA', this.$store.state.shortcutData.filter(s => s.path !== item.path))
		},

		checkSharevisibility(item) {
			const extensions = item.extensions
			if (extensions === null) {
				return false
			} else {
				if (has(extensions, 'share')) {
					return extensions.share.shared === 'true'
				} else {
					return false
				}
			}
		},

	},
}
</script>

<style lang="scss" scoped>
.sidebar-drag-ghost {
	opacity: 0.4;
}
</style>
