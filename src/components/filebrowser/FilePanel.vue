<template>
	<div :class="containerClass">
		<div class="modal-card">
			<!-- Modal-Card Body Start -->
			<section class="modal-card-body is-flex">
				<!-- Viewer Start -->
				<transition name="c-zoom-in">
					<component :is="panelType" v-if="isShowDetial" ref="previewPanel" :item="currentItem" :list="listData"
						@close="isShowDetial = false; isModalOpen = false;"></component>
				</transition>
				<!-- Viewer End -->

				<!-- NavBar Start -->
				<b-sidebar ref="sidebar" v-model="isSideBarOpen" :overlay="isMobile" :position="sideBarPosition"
					fullheight>
					<div class="nav-bar is-flex is-flex-direction-column">
						<div class="is-flex-grow-1 is-flex-shrink-1 nav-bar-top scrollbars-light">
							<!-- Files Start -->
							<div class="files-section">
								<!--  storage settings requirement document -->
								<div class="is-flex is-align-items-center pt-3">
									<div class="is-flex-grow-1">
										<h3 class="title is-3 mb-0 pb-3 pt-3 has-text-left">
											{{ $t("Files") }}
										</h3>
									</div>
									<div v-show="hasMergerFunction && !isAccount" class="is-flex-shrink-0 mr-5 is-clickable"
										@click="showStorageSettingsModal">
										<b-icon custom-size="mdi-18px" icon="cog-outline"></b-icon>
									</div>
								</div>
								<div class="list-container scrollbars-light pt-0 is-flex-grow-1">
									<tree-list :auto-load="true" :is-active="pageType == `file`"
										:path="rootPath"></tree-list>
									<standalone-mount-list v-if="$standaloneFiles" :is-active="pageType === 'file'"
										:paths="mountPoints" />
								</div>
							</div>
							<!-- Files End -->

							<!-- Mounted Start: the drives of the box, the owner's -->
							<div v-if="!isAccount && !$standaloneFiles" class="mounted-section">
								<div class="is-flex is-align-items-center">
									<div class="is-flex-grow-1">
										<h3 class="title is-3 mb-0 pb-3 pt-3 has-text-left">
											{{ $t("Location") }}
										</h3>
									</div>
									<div class="is-flex-shrink-0 mr-5">
										<mount-action-button></mount-action-button>
									</div>
								</div>

								<div class="list-container pt-0 is-flex-grow-1">
									<mount-list :auto-load="true"
										:has-merger-function="hasMergerFunction" :is-active="pageType == `file`"
										:path="rootPath"></mount-list>
								</div>
							</div>
							<!-- Mounted End -->
						</div>

						<!-- Bottom Action Start -->
						<!-- Device transfers and shares are available to the owner. -->
						<div v-if="!isAccount || $standaloneFiles" class="bottom-area">
							<drop-entry-button v-if="!$standaloneFiles" :active="pageType == `drop`" :title="$t('FilesDrop')"
								@open="showDropPage"></drop-entry-button>
							<share-entry-button v-if="!$standaloneFiles" :active="pageType == `share`"
								@open="showSharedList"></share-entry-button>
							<RouterLink v-if="$standaloneFiles" :to="{ name: 'settings', query: $route.query }" class="is-flex list-item new-list-item">
								<div class="cover mr-2 is-flex-shrink-0 is-flex is-align-items-center">
									<b-icon aria-hidden="true" icon="settings-outline" pack="casa" />
								</div>
								<div><span>{{ $t('Settings') }}</span></div>
							</RouterLink>
							<button v-if="$standaloneFiles" class="is-flex list-item new-list-item files-sign-out"
								type="button" :disabled="isSigningOut" @click="signOut">
								<span class="cover mr-2 is-flex-shrink-0 is-flex is-align-items-center">
									<b-icon aria-hidden="true" icon="logout" pack="mdi" />
								</span>
								<span>Sign out</span>
							</button>
						</div>
						<!-- Bottom Action End -->
					</div>
				</b-sidebar>
				<!-- NavBar Start -->

				<!-- Main Content Start -->
				<template v-if="pageType == `file`">
					<div class="content is-flex-grow-1">
						<uploader ref="uploader" :options="options" :style="{ '--file-icon-size': `${iconSize}px` }" class="uploader-example">
							<uploader-unsupport></uploader-unsupport>
							<!-- Header Start -->
							<header :class="{ 'is-flex-wrap-wrap': isMobile }" class="modal-card-head">
								<div id="bread-container" class="is-flex-grow-1 is-flex breadcrumb-container">
									<!-- SideBar Button Start -->
									<sidebar-menu-button></sidebar-menu-button>
									<!-- SideBar Button End -->
									<file-breadcrumb v-if="!isMobile"></file-breadcrumb>
									<!-- <b-input placeholder="Search in folder..." size="is-small" rounded></b-input> -->
								</div>
								<div class="is-flex is-align-items-center">
									<!-- Paste Button Start -->
									<b-button v-if="hasPasteData && canChangeHere" :label="$t('Paste')" :loading="isPasting" class="mr-3"
										icon-left="content-paste" rounded size="is-small" type="is-success"
										@click="paste('overwrite')" />
									<!-- Paste Button End -->

									<!-- Operation Status Start -->
									<operation-status-bar v-if="!$standaloneFiles"></operation-status-bar>
									<!-- Operation Status End -->

									<!-- Upload Button Start -->
									<global-action-button v-if="canChangeHere" @showNewFileModal="showNewFileModal"
										@showNewFolderModal="showNewFolderModal"></global-action-button>
									<!-- Upload Button End -->

									<!--  Close Button Start -->
									<div v-if="!$standaloneFiles"
										class="is-flex is-align-items-center modal-close-container modal-close-container-line">
										<NewTabButton :params="{ path: currentPath }" class="mr-2" page="files" />
										<div class="close-button" @click="$emit('close')">
											<b-icon icon="close-outline" pack="casa"></b-icon>
										</div>
									</div>
									<!--  Close Button End -->
								</div>
								<div v-if="isMobile" class="pt-2" style="width: 100%">
									<file-breadcrumb></file-breadcrumb>
								</div>
							</header>

							<!-- Header End -->

							<!-- Tool Bar Start -->
							<div v-if="allListData.length > 0" class="tool-bar is-flex mb-2 mt-2 is-flex-shrink-0">
								<div class="is-flex-grow-1 has-text-left is-flex is-align-items-center">
									<b-field class="ml-1 is-flex is-size-14px mb-0" expanded>
										<b-checkbox v-model="isSelectAll" :class="selectState" size="is-small"
											@update:model-value="handleSelect">
											{{
												selectState != "none"
													? $t("select-items", selectLabel)
													: $t("total-items", selectLabel)
											}}
										</b-checkbox>
									</b-field>
								</div>
								<div class="view-btns is-flex-shrink-0">
									<b-tooltip v-if="!$standaloneFiles" :label="showHiddenFilesLabel" position="is-left" type="is-dark">
										<p :aria-label="showHiddenFilesLabel" :aria-pressed="showHiddenFiles"
											class="is-clickable none-line-height mr-3" role="button" tabindex="0"
											@keydown.enter.prevent="toggleHiddenFiles" @keydown.space.prevent="toggleHiddenFiles"
											@click="toggleHiddenFiles">
											<span aria-hidden="true" class="file-view-icon">{{ hiddenFilesIcon }}</span>
										</p>
									</b-tooltip>
									<b-dropdown position="is-bottom-left" aria-role="menu" class="file-dropdown mr-3">
										<template #trigger>
											<b-tooltip :label="$t('Sort by')" position="is-left" type="is-dark">
												<p :aria-label="$t('Sort by')" class="is-clickable none-line-height" role="button" tabindex="0">
													<span aria-hidden="true" class="file-view-icon">sort</span>
												</p>
											</b-tooltip>
										</template>
											<b-dropdown-item v-for="option in sortOptions" :key="option.sort"
												:aria-current="$store.state.sort === option.sort ? 'true' : null" aria-role="menuitem"
												@click="pickSort(option.sort)">
											{{ $t(option.text) }}
											<span v-if="$store.state.sort === option.sort" class="ml-1">{{ $store.state.order === 'asc' ? '↑' : '↓' }}</span>
										</b-dropdown-item>
									</b-dropdown>
									<b-tooltip :label="$t('Change View')" position="is-left" type="is-dark">
										<p :aria-label="$t('Change View')" class="is-clickable none-line-height" role="button" tabindex="0"
											@keydown.enter.prevent="changeView" @keydown.space.prevent="changeView" @click="changeView">
											<span aria-hidden="true" class="file-view-icon">{{ viewIcon }}</span>
										</p>
									</b-tooltip>
								</div>
							</div>
							<!-- Tool Bar End -->

							<!-- List View Start -->
							<div id="dropTarget" class="is-flex-grow-1 is-flex over is-justify-content-center ">
								<!-- Drag and Drop Mask Start -->
								<div v-if="isDragIn && canChangeHere"
									class="drag-mask is-flex is-align-items-flex-end is-flex-direction-row ">
									<div class="mb-6">
										<div class="upload-icon">
											<b-icon icon="arrow-up" size="is-medium" type="is-white"></b-icon>
										</div>
										<p class="has-text-primary">
											{{ $t("Upload to") }} {{ currentPathName }}
										</p>
									</div>
								</div>
								<!-- Drag and Drop Mask End -->

								<component :is="listView" ref="listview" :list-data="listData" :is-loading="isLoading"
									@change="handelListChange" @gotoFolder="getFileList" @reload="reload" @reorder="setSort"
									@showDetailModal="showDetailModal">
									<empty-holder v-if="isEmpty" @newFile="showNewFileModal"
										@newFolder="showNewFolderModal"></empty-holder>
									<error-holder v-else :error="errorMsg"></error-holder>
								</component>
							</div>
							<!-- List View End -->

							<footer v-if="$store.state.isViewGird" class="icon-size-footer">
								<input v-model.number="iconSize" :aria-label="$t('Icon size')" :title="$t('Icon size')"
									class="icon-size-slider" type="range" min="64" max="256" step="8">
							</footer>

							<!-- Upload List Start -->
							<div v-show="showUploadList" class="upload-list">
								<b-collapse v-model="openUploadList" animation="slide1"
									aria-id="contentIdForA11y3" class="card">
									<template #trigger>
										<div :aria-expanded="openUploadList" aria-controls="contentIdForA11y3"
											class="card-header" role="button">
											<p class="card-header-title">
												<b-icon :icon="openUploadList ? 'down-outline' : 'up-outline'
												" pack="casa" class="mr-2"></b-icon>
												{{ $t(uploaderListHeaderText) }}
											</p>
											<a class="card-header-icon" @click.prevent="closeUploaderList">
												<b-icon icon="close-outline" pack="casa"></b-icon>
											</a>
										</div>
									</template>

									<div class="card-content scrollbars-light">
										<div class="content">
											<uploader-list></uploader-list>
										</div>
									</div>
								</b-collapse>
							</div>
							<!-- Upload List End -->
						</uploader>
						<!-- Toolbar Start -->
						<operation-toolbar v-model="isToolbarShow" :can-change="canChangeHere" @close="handleClose" @copy="handleCopy"
							@download="handleDownload" @move="handleMove" @remove="handleRemove"></operation-toolbar>
						<!-- Toolbar End -->
					</div>
				</template>

				<!-- Share Page Start -->
				<template v-else-if="pageType == `share`">
					<share-list-page ref="shareList" @close="$emit('close')"></share-list-page>
				</template>
				<!-- Share Page End -->

				<!-- Drop Page Start -->
				<template v-else-if="pageType == `drop`">
					<drop-page @close="$emit('close')"></drop-page>
				</template>
				<!-- Drop Page End -->

				<!-- Main Content End -->
			</section>
			<!-- Modal-Card Body End -->
			<b-loading v-model="isLoading" :is-full-page="false">
				<b-image :src="require('@/assets/img/loading/waiting.svg')" alt="pending" class="is-100x100 mt-6" />
			</b-loading>
		</div>
	</div>
</template>

<script>
import { useLocalStorage } from '@vueuse/core'
import { defineAsyncComponent } from 'vue'
import dropRight from 'lodash/dropRight'
import escape from 'lodash/escape'

import { parentOf } from './sidebar/starred.js'
import TreeList from './sidebar/TreeList.vue'
import MountList from './sidebar/MountList.vue'
import StandaloneMountList from './sidebar/StandaloneMountList.vue'
import ShareEntryButton from './shared/ShareEntryButton.vue'
import ShareListPage from './shared/ShareListPage.vue'

import SelectShareModal from './shared/SelectShareModal.vue'
import ShareDetial from './shared/ShareDetial.vue'

import GirdView from './components/GirdView.vue'
import ListView from './components/ListView.vue'
import FileBreadcrumb from './components/FileBreadcrumb.vue'
import EmptyHolder from './components/EmptyHolder.vue'
import ErrorHolder from './components/ErrorHolder.vue'
import SidebarMenuButton from './components/SidebarMenuButton.vue'

import DetailModal from './modals/DetailModal.vue'
import NewFolderModal from './modals/NewFolderModal.vue'
import NewFileModal from './modals/NewFileModal.vue'
import RenameModal from './modals/RenameModal.vue'
import FolderIconModal from './modals/FolderIconModal.vue'

import Uploader from './uploader/components/uploader.vue'
import UploaderUnsupport from './uploader/components/unsupport.vue'
import UploaderList from './uploader/components/list.vue'
import OperationToolbar from './components/OperationToolbar.vue'
import OperationStatusBar from './components/OperationStatusBar.vue'
import GlobalActionButton from './components/GlobalActionButton.vue'
import MountActionButton from './components/MountActionButton.vue'
// storage settings requirement document
import DropEntryButton from './drop/DropEntryButton.vue'
import { FILE_ROOTS_TIMEOUT_MS, accountFoldersFrom, canChangeIn, fileRootFrom, withTimeout } from './fileRoot.js'
import MergeStorages from '@/components/Storage/MergeStorages.vue'

// Drop
import events from '@/events/events'
import VueBreakpointMixin from '@/mixins/breakpoint'
import { filterHiddenFiles, sortFiles } from '@/mixins/file_utils'
import { mixin } from '@/mixins/mixin'
import NewTabButton from '@/components/basicComponents/NewTabButton.vue'
import { filesAccountRequest, filesSessionExpired } from '@/service/filesAccounts'

const fileMoveDragType = 'application/x-files-move'

export default {
	name: 'file-panel',
	mixins: [mixin, VueBreakpointMixin],
	provide() {
		return {
			filePanel: this,
		}
	},
	components: {
		NewTabButton,
		ListView,
		GirdView,
		FileBreadcrumb,
		TreeList,
		Uploader,
		UploaderUnsupport,
		UploaderList,
		CodeEditor: defineAsyncComponent(() => import('./viewers/CodeEditor.vue')),
		VideoPlayer: defineAsyncComponent(() => import('./viewers/VideoPlayer.vue')),
		ImageViewer: defineAsyncComponent(() => import('./viewers/ImageViewer.vue')),
		DocViewer: defineAsyncComponent(() => import('./viewers/DocViewer.vue')),
		ExcelViewer: defineAsyncComponent(() => import('./viewers/ExcelViewer.vue')),
		PdfViewer: defineAsyncComponent(() => import('./viewers/PdfViewer.vue')),
		StlViewer: defineAsyncComponent(() => import('./viewers/StlViewer.vue')),
		EmptyHolder,
		ErrorHolder,
		OperationToolbar,
		RenameModal,
		OperationStatusBar,
		GlobalActionButton,
		// Shared
		ShareEntryButton,
		ShareListPage,
		MountList,
		StandaloneMountList,
		MountActionButton,
		// Drop
		DropPage: defineAsyncComponent(() => import('./drop/DropPage.vue')),
		DropEntryButton,
		SidebarMenuButton,
	},
	setup() {
		const iconSize = useLocalStorage('casaos-filebrowser-icon-size', 96)
		return { iconSize }
	},
	data() {
		return {
			isCreated: false,
			isUnmounted: false,
			isLoading: true,
			isModalOpen: false,
			isDragIn: false,
			draggedFiles: [],
			moveTarget: null,
			isMovingFiles: false,
			isPasting: false,
			isSigningOut: false,
			isShowDetial: false,
			isSideBarOpen: false,
			pageType: 'file',
			panelType: null,
			currentItem: null,
			rootPath: '/DATA',
			fileRootReady: false,
			mountPoints: [],
			// the folders given to an account and the ones it may write (CasaOS#168); null for the owner
			accountFolders: null,
			currentPath: '',
			currentPathName: '',
			isViewGird: true,
			sortOptions: [
				{ sort: 'name', text: 'File name' },
				{ sort: 'date', text: 'Date Modified' },
				{ sort: 'size', text: 'Size' },
				{ sort: 'format', text: 'Type' },
			],
			allListData: [],
			listData: [],
			selectedArray: [],
			file: null,
			timeout: null,
			uploadPercentage: 0,
			hasPasteData: this.$store.state.operateObject != null,
			uploaderInstance: {},
			selectState: 'none',
			isSelectAll: false,
			selectLabel: {},
			isToolbarShow: false,
			isEmpty: true,
			errorMsg: '',

			attrs: {
				accept: '*',
			},
			// Uploader List
			showUploadList: false,
			openUploadList: true,
			uploaderListHeaderText: 'Uploading',
			hasMergerFunction: false,
		}
	},
	async created() {
		this.options = {
			target: this.getTargetUrl(),
			testChunks: false,
			uploadMethod: 'POST',
			...(this.$standaloneFiles && {
				method: 'octet',
				chunkSize: Number.MAX_SAFE_INTEGER,
				maxChunkRetries: 0,
			}),
			successStatuses: [200, 201, 202, 2002],
			// 403: a folder an account may only read, or one it was not given
			permanentErrors: [403, 404, 409, 415, 500, 501],
			allowDuplicateUploads: true,
			headers: {
				...(!this.$standaloneFiles && { Authorization: this.token }),
			},
			query: (file) => {
				return {
					path: file.targetPath,
				}
			},
			// generateUniqueIdentifier: nanoid(),
			// chunkSize: 1024 * 1024 * 1024 * 1024 * 1024,
			// forceChunkSize: true,
		}
		// get merge info: the storage settings are the owner's
		if (this.$standaloneFiles || !this.$store.getters.canWrite)
			return
		try {
			const hasMergeState = await this.$api.local_storage
				.getMergerfsInfo()
				.then(res => res.status)
			this.hasMergerFunction = hasMergeState == 200
		} catch (e) {
			console.error(e)
		}
	},

	computed: {
		// an account given folders, not the owner: Files shows its folders only
		isAccount() {
			return this.accountFolders !== null
		},
		// what is shown may be changed: anywhere by the owner, in a writable folder by an account
		canChangeHere() {
			return canChangeIn(this.currentPath, this.accountFolders)
		},
		viewIcon() {
			return this.$store.state.isViewGird
				? 'grid_view'
				: 'format_list_bulleted'
		},
		showHiddenFiles() {
			return this.$store.state.showHiddenFiles
		},
		hiddenFilesIcon() {
			return this.showHiddenFiles ? 'visibility_off' : 'visibility'
		},
		showHiddenFilesLabel() {
			return this.$t(this.showHiddenFiles ? 'Hide hidden files' : 'Show hidden files')
		},
		listView() {
			return this.$store.state.isViewGird ? 'gird-view' : 'list-view'
		},
		containerClass() {
			return this.$route.path == '/files' ? 'file-panel full-screen ' : ''
		},
		sideBarPosition() {
			return this.isMobile ? 'fixed' : 'static'
		},
		token() {
			return (
				this.$store.state.access_token || localStorage.getItem('access_token')
			)
		},
	},
	watch: {
		showHiddenFiles() {
			this.clearSelection()
			this.updateVisibleList()
			this.handelListChange(this.listData)
		},
		'$store.state.access_token': {
			handler(val) {
				this.options.headers.Authorization = val
			},
			deep: true,
		},
		'$store.state.operateObject': {
			handler(val) {
				this.hasPasteData = val != null
			},
			deep: true,
		},
		pageType(val) {
			switch (val) {
				case 'file':
					this.$nextTick(() => {
						this.beforeInit()
					})

					break
				case 'share':
					this.destroyedAction()
					break
				case 'drop':
					this.destroyedAction()
					break
				default:
					break
			}
		},
		isMobile(val) {
			if (val) {
				this.isSideBarOpen = false
			} else {
				this.isSideBarOpen = true
			}
		},
	},

	mounted() {
		// everything that listens is set up now; only the first folder waits for the root
		if (this.pageType == 'file') {
			this.beforeInit()
		}

		this.isSideBarOpen = !this.isMobile

		document.addEventListener('contextmenu', this.hideContextMenu)
		this.$EventBus.$on(events.GOTO, (event) => {
			this.getFileList(event.path)
		})

		this.$EventBus.$on(events.SELECT_SHARE, this.handleSelectShare)
		this.$EventBus.$on(events.UN_SHARE, this.handleUnShare)
		this.$EventBus.$on(events.SHOW_FILES_SIDEBAR, this.handleShowSideBar)
		this.$EventBus.$on(events.HIDE_FILES_SIDEBAR, this.handleHideSideBar)

		this.openFirstFolder()
	},
	unmounted() {
		this.isUnmounted = true
		this.$EventBus.$off(events.SHOW_FILES_SIDEBAR, this.handleShowSideBar)
		this.$EventBus.$off(events.HIDE_FILES_SIDEBAR, this.handleHideSideBar)
		this.destroyedAction()
	},

	methods: {
		async signOut() {
			this.isSigningOut = true
			try {
				await filesAccountRequest('logout', { method: 'POST' })
				window.dispatchEvent(new Event(filesSessionExpired))
				await this.$router.replace({ name: 'files' })
			} catch (error) {
				this.$buefy.toast.open({ message: escape(error.message), type: 'is-danger' })
			} finally {
				this.isSigningOut = false
			}
		},

		/*************************************************
		 * PART 0  Self
		 **************************************************/

		beforeInit() {
			this.setUploaderOpts()
			// Listen to ESC button to exit preview
			document.onkeyup = (e) => {
				switch (e.code) {
					case 'Escape':
						if (this.isShowDetial) {
							if (this.$refs.previewPanel?.close) {
								this.$refs.previewPanel.close()
							} else {
								this.isShowDetial = false
								this.isModalOpen = false
							}
						}
						break
					case 'Backspace':
						this.backLevel()
						break

					default:
						break
				}
			}
			// paste
			document.onpaste = () => {
				if (!this.isShowDetial && !this.isModalOpen) {
					this.paste('overwrite')
				}
			}
		},

		destroyedAction() {
			if (this.pageType == 'file') {
				this.uploaderInstance.off('fileSuccess')
				this.uploaderInstance.off('fileError')
				this.uploaderInstance.off('fileProgress')
				this.uploaderInstance.off('dragleave')
				this.uploaderInstance.off('dragover')
				this.uploaderInstance.off('uploadStart')

				this.$store.commit('SET_OPERATE_OBJECT', null)
				document.onpaste = null
				document.onkeyup = null
			}
			document.removeEventListener('contextmenu', this.hideContextMenu)
			// this.uploaderInstance.off('dragover')
			// this.uploaderInstance.off('uploadStart')
			// document.removeEventListener('contextmenu', this.hideContextMenu)
			// this.$store.commit('SET_OPERATE_OBJECT', null)
			// document.onpaste = null;
			// document.onkeyup = null;
		},

		showSharedList() {
			this.pageType = 'share'
			this.hideMobileSidebar()
		},

		showDropPage() {
			this.pageType = 'drop'
			this.hideMobileSidebar()
		},

		async openFirstFolder() {
			await this.resolveFileRoot()
			// the panel was closed while the root was being asked
			if (this.isUnmounted) {
				return
			}
			this.init()
			this.$EventBus.$emit(events.RELOAD_FILE_LIST)
			// on a tab of its own nobody calls init(path): the folder comes in the
			// address (#/files?path=/DATA/...)
			if (this.$route.path == '/files') {
				this.init(this.$route.query.path)
			}
		},

		async resolveFileRoot() {
			try {
				const res = await withTimeout(this.$api.file.getRoots(), FILE_ROOTS_TIMEOUT_MS)
				const data = res?.data?.data
				this.accountFolders = accountFoldersFrom(data)
				this.rootPath = this.accountFolders ? (this.accountFolders.folders[0] || '/') : fileRootFrom(data?.roots)
				if (this.$standaloneFiles) {
					this.mountPoints = data?.mount_points ?? []
				}
			} catch {
				this.rootPath = '/DATA'
			}
			this.fileRootReady = true
		},

		/**
		 * @description: Init Funtion
		 * @return {*}
		 */
		init(path) {
			const initPath = path || this.rootPath
			if (this.isCreated) {
				this.getFileList(initPath)
				// this.$refs.mountedList.getStorageList();
			} else {
				this.isCreated = true
			}
		},

		/**
		 * @description: Get File Tree List
		 * @param {string} path
		 * @return {*}
		 */
		getFileList(path) {
			this.clearFileDrag()
			this.isLoading = true
			// path = path.replace("//", "/")
			this.pageType = 'file'
			this.currentPath = path
			this.$store.commit('SET_CURRENT_PATH', path)
			this.$api.folder
				.getList(path)
				.then((res) => {
					if (res.data.success == 200) {
						this.isLoading = false
						this.currentPathName = path.split('/').pop()
						const fileList = res.data.data.content
						this.allListData = fileList.map((item) => {
							return {
								date: item.date,
								isSelected: false,
								is_dir: item.is_dir,
								name: item.name,
								path: item.path,
								size: item.size,
								write: item.write,
								extensions: item.extensions,
								folder_icon: item.folder_icon,
							}
						})
						this.updateVisibleList()
						this.handelListChange(this.listData)
						this.errorMsg = ''
						this.isEmpty = true
					}
				})
				.catch((error) => {
					this.isLoading = false
					this.isEmpty = false
					this.allListData = []
					this.listData = []
					this.errorMsg = error.response?.data?.data || this.$t('Something went wrong')
					this.handelListChange(this.listData)
				})

			this.hideMobileSidebar()
		},

		/**
		 * @description: Reload current folder
		 * @return {*}
		 */
		reload() {
			this.getFileList(this.$store.state.currentPath)
			this.$EventBus.$emit(events.RELOAD_FILE_LIST)
		},

		/**
		 * @description: Change View List/Gird
		 * @return {*}
		 */
		// Sorts the folder on screen and keeps the choice for the next visit.
		setSort({ sort, order }) {
			this.$store.commit('SET_FILE_SORT', { sort, order })
			this.updateVisibleList()
		},

		// From the toolbar menu: the field already in use flips its order, another starts A to Z (newest first for dates).
		pickSort(sort) {
			const { sort: current, order } = this.$store.state
			if (sort === current)
				this.setSort({ sort, order: order === 'asc' ? 'desc' : 'asc' })
			else
				this.setSort({ sort, order: sort === 'date' ? 'desc' : 'asc' })
		},

		changeView() {
			this.isViewGird = !this.$store.state.isViewGird
			this.$store.commit('SET_IS_VIEW_GRID', this.isViewGird)
		},

		/**
		 * @description: Apply the hidden-file preference to the current folder.
		 * @return {*}
		 */
		updateVisibleList() {
			const visibleList = filterHiddenFiles(this.allListData, this.showHiddenFiles)
			this.listData = sortFiles(visibleList, this.$store.state.sort, this.$store.state.order)
		},

		/**
		 * @description: Reset selection state after changing the visible list.
		 * @return {*}
		 */
		clearSelection() {
			this.allListData.forEach((item) => {
				item.isSelected = false
			})
			this.selectedArray = []
			this.selectState = 'none'
			this.isSelectAll = false
			this.isToolbarShow = false
			if (this.$refs.listview) {
				this.$refs.listview.selectList = []
			}
		},

		/**
		 * @description: Toggle visibility of dot-prefixed files and folders.
		 * @return {*}
		 */
		toggleHiddenFiles() {
			this.$store.commit('SET_SHOW_HIDDEN_FILES', !this.showHiddenFiles)
		},

		/**
		 * @description: Handle Select All Action
		 * @param {*} bool
		 * @return {*}
		 */
		handleSelect(bool) {
			if (bool) {
				this.listData.forEach((item, index) => {
					item.isSelected = true
					this.$refs.listview.selectList.push(index)
				})
			} else {
				this.listData.forEach((item) => {
					item.isSelected = false
				})
				this.$refs.listview.selectList = []
			}
			this.handelListChange(this.listData)
		},

		/**
		 * @description: Handle List data change (Selected State)
		 * @param {*} list
		 * @return {*}
		 */
		handelListChange(list) {
			this.selectedArray = list.filter((item) => {
				return item.isSelected
			})
			if (this.selectedArray.length == list.length && list.length > 0) {
				this.selectState = 'all'
				this.isSelectAll = true
				this.selectLabel = { num: list.length }
				this.isToolbarShow = true
			} else if (
				this.selectedArray.length < list.length
				&& this.selectedArray.length > 0
			) {
				this.selectState = 'part'
				this.isSelectAll = false
				this.selectLabel = { num: this.selectedArray.length }
				this.isToolbarShow = true
			} else {
				this.selectState = 'none'
				this.isSelectAll = false
				this.selectLabel = { num: list.length }
				this.isToolbarShow = false
			}
		},

		/**
		 * @description: Handle Backspace Event Back to upper level
		 * @return {*}
		 */
		backLevel() {
			if (this.isModalOpen)
				return false
			const pathArr = this.$store.state.currentPath.substr(1).split('/')
			if (pathArr.length == 1) {
				return false
			}
			const newPath = `/${dropRight(pathArr).join('/')}`
			this.getFileList(newPath)
		},

		canDragFile(item) {
			return this.$standaloneFiles && !this.isLoading && !this.isMovingFiles && this.canChangeHere
				&& item.write !== false && !this.mountPoints.includes(item.path)
		},

		startFileDrag(event, item) {
			if (!this.$standaloneFiles)
				return
			const items = item.isSelected && this.selectedArray.length ? this.selectedArray : [item]
			if (!items.every(entry => this.canDragFile(entry))) {
				event.preventDefault()
				return
			}
			event.dataTransfer.clearData()
			event.dataTransfer.setData(fileMoveDragType, 'move')
			event.dataTransfer.effectAllowed = 'move'
			this.draggedFiles = items
		},

		clearFileDrag() {
			this.draggedFiles = []
			this.moveTarget = null
		},

		canDropFiles(event, target) {
			return this.draggedFiles.length > 0 && event.dataTransfer.types.includes(fileMoveDragType)
				&& target.is_dir !== false && target.type !== 'file' && !target.unavailable
				&& target.write !== false && target.entry?.write !== false && canChangeIn(target.path, this.accountFolders)
				&& this.draggedFiles.every(({ path }) => target.path !== parentOf(path)
					&& target.path !== path && !target.path.startsWith(`${path}/`))
		},

		showMoveTarget(event, target) {
			if (!this.canDropFiles(event, target))
				return
			event.preventDefault()
			event.stopPropagation()
			event.dataTransfer.dropEffect = 'move'
			this.moveTarget = target.path
		},

		leaveMoveTarget(event, path) {
			if (this.moveTarget === path && !event.currentTarget.contains(event.relatedTarget))
				this.moveTarget = null
		},

		async dropFiles(event, target) {
			if (!this.canDropFiles(event, target))
				return
			event.preventDefault()
			event.stopPropagation()
			const item = this.draggedFiles.map(file => ({ from: file.path }))
			this.clearFileDrag()
			this.isMovingFiles = true
			try {
				const { data } = await this.$api.batch.task({ type: 'move', to: target.path, item, style: 'skip' })
				if (data.success !== 200)
					throw new Error(data.message)
			} catch (error) {
				this.$buefy.toast.open({ message: escape(error.response?.data?.message || error.message), type: 'is-danger' })
			} finally {
				this.isMovingFiles = false
				this.reload()
			}
		},

		/**
		 * @description: Paste Files
		 * @return {*}
		 */
		paste(style = 'overwrite') {
			if (this.$store.state.operateObject == null)
				return false
			this.isPasting = true
			const operateObject = this.$store.state.operateObject
			operateObject.to = this.$store.state.currentPath
			operateObject.style = style

			this.$api.batch.task(operateObject).then((res) => {
				this.isPasting = false
				if (res.data.success == 200) {
					this.$store.commit('SET_OPERATE_OBJECT', null)
					if (this.$standaloneFiles)
						this.reload()
				} else {
					this.$buefy.toast.open({
						message: escape(res.data.message),
						type: 'is-danger',
					})
				}
			}).catch((error) => {
				this.isPasting = false
				if (this.$standaloneFiles)
					this.reload()
				this.$buefy.toast.open({ message: escape(error.response?.data?.message || error.message), type: 'is-danger' })
			})
		},

		/**
		 * @description: Hide Context Menu
		 * @return {*}
		 */
		hideContextMenu() {
			if (this.$refs.moreBtn) {
				this.$refs.moreBtn.isActive = false
			}
		},

		/*************************************************
		 * PART 1  Uploader
		 **************************************************/

		/**
		 * @description: Get Uploader Target URL
		 * @return {*}
		 */
		getTargetUrl() {
			return `${this.$protocol}//${this.$baseURL}/v2/casaos/file/upload`
		},

		/**
		 * @description: Set Uploader Options
		 * @return {*}
		 */
		setUploaderOpts() {
			this.uploaderInstance = this.$refs.uploader.uploader
			this.assignUploadButtons()

			this.uploaderInstance.on('fileAdded', (file) => {
				file.targetPath = this.currentPath
			})

			// Drag Over
			this.uploaderInstance.on('dragover', (event) => {
				if (!event.dataTransfer.types.includes('Files')) {
					event.dataTransfer.dropEffect = 'none'
					return
				}
				this.isDragIn = true
				this.openUploadList = false
				if (this.timeout !== null) {
					clearTimeout(this.timeout)
				}
				this.timeout = setTimeout(() => {
					this.isDragIn = false
					this.timeout = null
				}, 120)
				event.stopPropagation()
				event.preventDefault()
			})

			this.uploaderInstance.on('uploadStart', () => {
				this.isDragIn = false
				this.showUploadList = true
				this.openUploadList = true
				this.uploaderListHeaderText = 'Uploading'
			})

			this.uploaderInstance.on('complete', () => {
				this.getFileList(this.currentPath)
				this.uploaderListHeaderText = 'Completed'
			})
		},

		/**
		 * @description: Close Uploader List
		 * @return {*}
		 */
		closeUploaderList() {
			this.showUploadList = false
			this.uploaderInstance.cancel()
		},

		/**
		 * @description: Assig nUpload Buttons
		 * @return {*}
		 */
		assignUploadButtons() {
			this.uploaderInstance.assignDrop(document.getElementById('dropTarget'))
		},

		/*************************************************
		 * PART 2  Modals
		 **************************************************/

		/**
		 * @description: Show Detail Modal
		 * @param {object} item
		 * @return {*}
		 */
		showDetailModal(item) {
			this.isModalOpen = true
			this.panelType = this.getPanelType(item)
			if (this.panelType !== null) {
				this.currentItem = item
				this.isShowDetial = true
			} else {
				this.$buefy.modal.open({
					component: DetailModal,
					hasModalCard: true,
					customClass: 'detail-panel file-modal',
					trapFocus: true,
					canCancel: [],
					scroll: 'keep',
					animation: 'zoom-in',
					props: {
						item,
					},
					events: {
						close: () => {
							this.isModalOpen = false
						},
					},
				})
			}
		},

		/**
		 * @description: Show New Folder Modal
		 * @return {*}
		 */
		showNewFolderModal() {
			this.isModalOpen = true
			this.$buefy.modal.open({
				component: NewFolderModal,
				hasModalCard: true,
				customClass: 'file-modal',
				trapFocus: true,
				canCancel: [''],
				scroll: 'keep',
				animation: 'zoom-in',
				props: {
					currentPath: this.currentPath,
					rootPath: this.rootPath,
				},
				events: {
					reload: () => {
						this.reload()
					},
					close: () => {
						this.isModalOpen = false
					},
				},
			})
		},

		/**
		 * @description: Show New File Modal
		 * @return {*}
		 */
		showNewFileModal() {
			this.isModalOpen = true
			this.$buefy.modal.open({
				component: NewFileModal,
				hasModalCard: true,
				customClass: 'file-modal',
				trapFocus: true,
				canCancel: [''],
				scroll: 'keep',
				animation: 'zoom-in',
				props: {
					currentPath: this.currentPath,
				},
				events: {
					reload: () => {
						this.reload()
					},
					close: () => {
						this.isModalOpen = false
					},
				},
			})
		},

		/**
		 * @description: Show Rename Modal
		 * @param {object} item
		 * @return {*}
		 */
		showRenameModal(item) {
			this.isModalOpen = true
			this.$buefy.modal.open({
				component: RenameModal,
				hasModalCard: true,
				customClass: 'file-modal',
				trapFocus: true,
				canCancel: [''],
				scroll: 'keep',
				animation: 'zoom-in',
				events: {
					reload: () => {
						this.reload()
					},
					close: () => {
						this.isModalOpen = false
					},
				},
				props: {
					item,
				},
			})
		},

		showFolderIconModal(item) {
			this.isModalOpen = true
			this.$buefy.modal.open({
				component: FolderIconModal,
				hasModalCard: true,
				trapFocus: true,
				canCancel: ['escape'],
				ariaRole: 'dialog',
				ariaModal: true,
				ariaLabel: this.$t('Change folder icon'),
				scroll: 'keep',
				animation: 'zoom-in',
				props: { item },
				onClose: () => {
					this.isModalOpen = false
				},
				events: {
					save: (icon) => {
						item.folder_icon = icon
						this.$EventBus.$emit(events.RELOAD_FILE_LIST)
					},
				},
			})
		},

		/*************************************************
		 * PART 3  Toolbar Action
		 **************************************************/

		/**
		 * @description: handle Toolbar Close
		 * @return {*}
		 */
		handleClose() {
			this.isSelectAll = false
			this.handleSelect(this.isSelectAll)
		},

		/**
		 * @description: handle Toolbar Remove
		 * @return {*}
		 */
		handleRemove() {
			this.confirmDelete(this.selectedArray, () => this.handleClose())
		},

		// Shared by the toolbar and the right-click menu.
		confirmDelete(items, afterConfirm) {
			this.$buefy.dialog.confirm({
				title: this.$t('Delete'),
				message: this.$t('The selected files and folders will be permanently deleted.'),
				confirmText: this.$t('Delete permanently'),
				type: 'is-danger',
				hasIcon: true,
				onConfirm: () => {
					this.deleteItem(items)
					if (afterConfirm) {
						afterConfirm()
					}
				},
			})
		},

		/**
		 * @description: Handle Toolbar Move
		 * @return {*}
		 */
		handleMove() {
			this.operate('move', this.selectedArray)
			this.handleClose()
		},

		/**
		 * @description: Handle Toolbar copy
		 * @return {*}
		 */
		handleCopy() {
			this.operate('copy', this.selectedArray)
			this.handleClose()
		},

		/**
		 * @description: handle Toolbar Download
		 * @return {*}
		 */
		handleDownload() {
			const downItem
				= this.selectedArray.length == 1
					? this.selectedArray[0]
					: this.selectedArray
			this.downloadFile(downItem)
			this.handleClose()
		},

		/*************************************************
		 * PART 4  Share Action
		 **************************************************/

		handleUnShare(item) {
			this.$buefy.dialog.confirm({
				title: this.$t('Unsharing Folder'),
				message: this.$t('Are you sure you want to unshare this Folder?'),
				confirmText: this.$t('UnShare'),
				cancelText: this.$t('Cancel'),
				iconPack: 'casa',
				icon: 'danger',
				type: 'is-danger',
				hasIcon: true,
				onConfirm: () => {
					this.$api.samba
						.deleteShare(item.id)
						.then(() => {
							this.reloadShare()
							this.$buefy.toast.open({
								message: this.$t('Folder unshared.'),
								type: 'is-success',
							})
						})
						.catch(() => {
							this.$buefy.toast.open({
								message: this.$t('Unshared failed.'),
								type: 'is-danger',
							})
						})
				},
			})
		},

		reloadShare() {
			switch (this.pageType) {
				case 'share':
					this.$refs.shareList.getSharedList()
					this.$EventBus.$emit(events.RELOAD_FILE_LIST)
					break
				case 'file':
					this.reload()
					break
				default:
					break
			}
		},

		handleSelectShare() {
			this.$buefy.modal.open({
				component: SelectShareModal,
				hasModalCard: true,
				customClass: 'share-detial-panel file-modal',
				trapFocus: true,
				canCancel: [''],
				scroll: 'keep',
				animation: 'zoom-in',
				events: {
					close: () => {
						// this.isModalOpen = false
					},
					reload: () => {
						this.reloadShare()
					},
				},
			})
		},
		getShareLink(item) {
			this.$buefy.modal.open({
				component: ShareDetial,
				hasModalCard: true,
				customClass: 'share-detial-panel file-modal',
				trapFocus: true,
				canCancel: [''],
				scroll: 'keep',
				animation: 'zoom-in',
				props: {
					item,
				},
			})
		},

		/*************************************************
		 * PART 5  storage settings Action
		 **************************************************/

		/*
		 * storage settings modal
		 * */
		// show storage settings modal
		async showStorageSettingsModal() {
			// TODO: the part is repetition
			//  with APPs Installation Location requirement document
			// 获取merge信息
			let mergeStorageList
			try {
				mergeStorageList = await this.$api.local_storage
					.getMergerfsInfo()
					.then(res => res.data.data[0].source_volume_uuids)
			} catch (e) {
				mergeStorageList = []
				console.log(e)
			}
			this.$buefy.modal.open({
				component: MergeStorages,
				hasModalCard: true,
				canCancel: false,
				animation: 'zoom-in',
				props: {
					mergeStorageList,
				},
				events: {},
			})
		},

		handleShowSideBar() {
			this.isSideBarOpen = true
		},
		handleHideSideBar() {
			this.isSideBarOpen = false
		},

		hideMobileSidebar() {
			if (this.isMobile) {
				this.$refs.sidebar.close()
			}
		},
	},
	sockets: {
		'casaos:file:operate': function (res) {
			const file_operate = JSON.parse(res.Properties.file_operate)
			const taskList = file_operate.data
			taskList.forEach((task) => {
				if (task.finished && task.to === this.currentPath) {
					this.reload()
				}
			})
		},
		'casaos:system:utilization': function () {
			// USB
			// this.usbDisks = data.body.sys_usb
		},
		storage_status() {
			// Storage
			this.reload()
		},
		'local-storage:disk:added': function () {
			setTimeout(() => {
				if (this.currentPath == this.rootPath) {
					this.reload()
				}
			}, 500)
		},
	},
}
</script>

<style lang="scss" scoped>
@font-face {
	font-family: "Material Icons Outlined";
	font-style: normal;
	font-weight: 400;
	font-display: block;
	src: url("../../assets/fonts/material-icons-outlined-files.woff2") format("woff2");
}

.file-view-icon {
	display: inline-block;
	width: 1em;
	height: 1em;
	font: 400 24px/1 "Material Icons Outlined";
	font-feature-settings: "liga";
	letter-spacing: normal;
	white-space: nowrap;
	vertical-align: middle;
	direction: ltr;
}

.files-sign-out {
	width: 100%;
	background: transparent;
	border: 0;
	font: inherit;
}

.icon-size-footer {
	display: flex;
	flex-shrink: 0;
	align-items: center;
	justify-content: flex-end;
	min-height: 2.5rem;
	padding: 0 1.5rem;
	border-top: 1px solid var(--casa-border-subtle);
}

.icon-size-slider {
	width: min(100%, 7.5rem);
	height: 2rem;
	margin: 0;
	cursor: pointer;

	@media (forced-colors: none) {
		appearance: none;
		background: transparent;

		&::-webkit-slider-runnable-track {
			height: 4px;
			border-radius: 2px;
			background: var(--casa-border-strong);
		}

		&::-moz-range-track {
			height: 4px;
			border-radius: 2px;
			background: var(--casa-border-strong);
		}

		&::-webkit-slider-thumb {
			appearance: none;
			width: 12px;
			height: 12px;
			margin-top: -4px;
			border: 0;
			border-radius: 50%;
			background: #949494;
		}

		&::-moz-range-thumb {
			width: 12px;
			height: 12px;
			border: 0;
			border-radius: 50%;
			background: #949494;
		}
	}
}

.full-screen {
	position: absolute;
	width: 100%;
	height: 100%;
	background-color: var(--casa-surface);
	z-index: 20;
	display: flex;

	// on a tab of its own (#/files) the panel is the whole window
	.modal-card {
		width: 100% !important;
		height: 100% !important;
		max-height: 100% !important;
		border-radius: 0;
		overflow: hidden;
	}
}

:deep(.file-move-target) {
	outline: 2px solid var(--bulma-link, #3285ff);
	outline-offset: -2px;
	border-radius: 4px;
}
</style>
