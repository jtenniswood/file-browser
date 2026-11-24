<template>
	<draggable v-if="!$standaloneFiles || sidebarItems.length" v-model="sidebarItems" :animation="180" :delay="160" :delay-on-touch-only="true"
		class="ul" ghost-class="sidebar-drag-ghost" item-key="path" @start="closePinMenu">
		<template #item="{ element: item }">
			<tree-list-item :is-active="isActive" :is-share="checkSharevisibility(item)" :item="item"
				:aria-haspopup="item.starred ? 'menu' : null" :role="item.starred ? 'link' : null"
				:tabindex="item.starred ? 0 : null" icon-color="casa-color-blue"
				@contextmenu="openPinMenu($event, item)" @keydown.context-menu="openPinMenu($event, item)"
				@keydown.shift.f10="openPinMenu($event, item)" />
		</template>
	</draggable>
	<div ref="pinMenu" class="dropdown file-dropdown pin-menu" popover="auto">
		<div class="dropdown-menu">
			<div class="dropdown-content" role="menu" :aria-label="$t('Pinned')">
				<button role="menuitem" type="button" class="dropdown-item" :disabled="unpinPending" autofocus @click="unpin">
					{{ $t('Unpin') }}
				</button>
			</div>
		</div>
	</div>
</template>

<script>
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
			pinPath: '',
			unpinPending: false,
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

		openPinMenu(event, item) {
			this.closePinMenu()
			const menu = this.$refs.pinMenu
			if (!item.starred || !menu.showPopover) {
				return
			}
			event.preventDefault()
			const row = event.currentTarget
			const bounds = row.getBoundingClientRect()
			const keyboard = event.type === 'keydown'
			const x = keyboard ? bounds.left : event.clientX
			const y = keyboard ? bounds.bottom : event.clientY
			this.pinPath = item.path
			row.focus({ preventScroll: true })
			menu.showPopover()
			menu.style.left = `${Math.max(0, Math.min(x, window.innerWidth - menu.offsetWidth))}px`
			menu.style.top = `${Math.max(0, Math.min(y, window.innerHeight - menu.offsetHeight))}px`
		},

		closePinMenu() {
			const menu = this.$refs.pinMenu
			if (menu?.hidePopover && menu.matches(':popover-open')) {
				menu.hidePopover()
			}
		},

		async unpin() {
			this.closePinMenu()
			this.unpinPending = true
			try {
				const remaining = this.$store.state.shortcutData.filter(item => item.path !== this.pinPath)
				await this.$store.dispatch('SET_SHORTCUT_DATA', remaining)
			} finally {
				this.unpinPending = false
			}
		},

		checkSharevisibility(item) {
			const extensions = item.extensions
			return extensions?.samba_shared === true || extensions?.share?.shared === 'true'
		},

	},
}
</script>

<style lang="scss" scoped>
.sidebar-drag-ghost {
	opacity: 0.4;
}

.pin-menu {
	display: none;
	position: fixed;
	inset: auto;
	margin: 0;
	padding: 0;
	border: 0;
	background: transparent;
	font-size: 1rem;
	overflow: visible;

	&:popover-open {
		display: block;
	}

	.dropdown-menu {
		display: block;
		position: static;
		padding: 0;
	}
}
</style>
