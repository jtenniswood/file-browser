import qs from 'qs'
import has from 'lodash/has'
import escape from 'lodash/escape'
import union from 'lodash/union'
import { renderSize } from './file_utils'
import { automaticFolderIcon } from '@/components/filebrowser/automaticFolderIcon'
import { customFolderIcon } from '@/components/filebrowser/folderIcons'

const typeMap = {
	'image-x-generic': ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp', 'avif', 'svg', 'tiff'],
	'video-x-generic': ['mkv', 'mp4', '3gp', 'avi', 'm2ts', 'webm', 'flv', 'vob', 'ts', 'mts', 'mov', 'wmv', 'rm', 'rmvb', 'asf', 'wmv', 'mpg', 'm4v', 'mpeg', 'f4v'],
	'audio-x-generic': ['aac', 'aiff', 'alac', 'amr', 'ape', 'flac', 'm4a', 'mp3', 'ogg', 'opus', 'wma', 'wav'],
	'text-x-generic': ['txt', 'log', 'pages', 'conf', 'config', 'list', 'ini', 'toml', 'cfg', 'rc', 'env', 'service', 'conf.d', 'htaccess', 'gitconfig', 'vim', 'curlrc', 'wgetrc', 'gitignore', 'm3u', 'm3u8', 'strm', 'nfo', 'vtt', 'properties', 'ovpn', 'patch', 'readme', 'license', 'lock', 'awk', 'cjs', 'desktop', 'gradle', 'jsx', 'lst', 'mjs', 'pls', 'rules', 'sed', 'socket', 'ssa', 'timer', 'tsx', 'webmanifest', 'xspf', 'pem', 'crt', 'cert', 'key', 'pub', 'sub'],
	'text-markdown': ['md'],
	'text-css': ['php', 'css', 'less', 'scss', 'sass', 'aspx', 'lua', 'vue', 'js', 'go', 'asp', 'bat', 'c', 'cpp', 'cs', 'json', 'py', 'perl', 'sh', 'xml', 'yaml', 'vb', 'vbs', 'sql', 'swift', 'rust', 'rs', 'jsp', 'yml', 'r', 'pl', 'rb', 'src', 'h', 'tex', 'rtf', 'jsonld', 'ttl', 'n3', 'rss', 'atom', 'srt', 'ass', 'tsv', 'vcard', 'asc', 'url', 'diff', 'plaintext'],
	'text-html': ['html', 'htm', 'shtml', 'shtm'],
	'application-vnd.ms-word': ['doc', 'docx', 'wps'],
	'application-vnd.ms-excel': ['xls', 'xlsx', 'csv'],
	'application-vnd.ms-powerpoint': ['ppt', 'pptx'],
	'application-pdf': ['pdf'],
	'application-x-model': ['stl'],
	'application-photoshop': ['psd', 'psb'],
	'application-illustrator': ['ai', 'eps'],
	'application-x-wine-extension-cpl': ['exe'],
	'application-apk': ['apk'],
	'application-x-zip': ['zip', 'rar', '7z', 'gz', 'ace', 'xz'],
	'application-x-cd-image': ['iso', 'img', 'vmdk', 'raw', 'vhd'],
	'application-x-apple': ['dmg', 'ipa', 'pkg'],
	'application-x-pem-key': ['pem', 'crt', 'ca-bundle', 'p7b', 'p7s', 'der', 'cer', 'pfx', 'p12'],
	'text-x-cmake': ['makefile', 'cmake', 'dockerfile'],
	'text-dockerfile': ['dockerfile'],
}
const hasThumbImageType = ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp', 'svg']

const filePanelMap = {
	'code-editor': union(typeMap['text-x-generic'], typeMap['text-markdown'], typeMap['text-css'], typeMap['text-html'], typeMap['text-x-cmake'], typeMap['text-dockerfile']),
	'video-player': union(typeMap['video-x-generic'], typeMap['audio-x-generic']),
	'image-viewer': typeMap['image-x-generic'],
	'doc-viewer': union(typeMap['application-vnd.ms-word']),
	'excel-viewer': union(typeMap['application-vnd.ms-excel']),
	'pdf-viewer': typeMap['application-pdf'],
	'stl-viewer': typeMap['application-x-model'],
}

export const mixin = {
	data() {
		return {
			baseUrl: `${this.$protocol}//${this.$baseURL}/v1/`,
			downloadIframe: null,
		}
	},
	mounted() {
		this.typeMap = typeMap
	},

	methods: {
		renderSize,

		/**
		 * @description: Get Default Lang from browser
		 * @return {string} lang
		 */
		getLangFromBrowser() {
			let lang = navigator.language || navigator.userLanguage
			lang = lang.toLowerCase().replace('-', '_')
			return lang
		},

		/**
		 * @description: Set Default Lang from browser
		 * @param {string} lang
		 * @return {void}
		 */
		//
		setLang(lang) {
			this.$store.commit('SET_LANGUAGE', lang)
			localStorage.setItem('lang', lang)
			this.$i18n.locale = lang
		},

		/**
		 * @description: Get file icon from file name
		 * @param {object} item
		 * @return {object}
		 */
		//
		getIconFile(item) {
			const isDir = (has(item, 'is_dir') || has(item, 'isFolder')) ? item.is_dir : false
			let icon = 'unknown'
			if (isDir) {
				const custom = customFolderIcon(item.folder_icon)
				if (custom)
					return custom
				icon = `folder-${automaticFolderIcon(item)}`
			} else {
				const ext = this.getFileExt(item)
				Object.keys(typeMap).forEach((_type) => {
					const extensions = typeMap[_type]
					if (extensions.includes(ext.toLowerCase())) {
						icon = _type
					}
				})
			}
			return require(`@/assets/img/filebrowser/${icon}.svg`)
		},
		getPanelType(item) {
			const ext = this.getFileExt(item)
			let type = null
			Object.keys(filePanelMap).forEach((_type) => {
				const extensions = filePanelMap[_type]
				if (extensions.includes(ext.toLowerCase())) {
					type = _type
				}
			})
			return type
		},
		getFileExt(item) {
			return item.name.substring(item.name.lastIndexOf('.') + 1)
		},
		/**
		 * @description: Download File
		 * @param {Object,Array} items
		 * @return {void}
		 */
		downloadFile(items) {
			this.$buefy.toast.open({
				message: this.$t('Download in preparation...'),
				type: 'is-white',
			})
			const url = this.getFileUrl(items, true)
			if (!this.downloadIframe) {
				this.downloadIframe = document.createElement('iframe')
				this.downloadIframe.style.display = 'none'
				document.body.appendChild(this.downloadIframe)
			}
			this.downloadIframe.src = url
			// window.open(url, '_blank');
		},
		// Download Button Action
		download() {
			this.$refs.dropDown?.toggle()
			this.downloadFile(this.item)
		},

		// Get File Download URL
		getFileUrl(items, download = false) {
			if (this.$standaloneFiles) {
				if (Array.isArray(items) || items.is_dir) {
					const params = new URLSearchParams()
					for (const item of [].concat(items))
						params.append('path', item.path)
					return `/v1/batch?${params}`
				}
				const params = new URLSearchParams({ path: items.path })
				if (download)
					params.set('download', '1')
				return `/v3/file?${params}`
			}
			let apiUrl = ''
			let path = ''
			const parameters = {
				token: this.$store.state.access_token,
			}
			if (items.constructor === Object) {
				if (items.is_dir) {
					apiUrl = `${this.baseUrl}batch`
					path = items.path
					parameters.files = path
					return `${apiUrl}?${qs.stringify(parameters)}`
				} else {
					apiUrl = `/v3/file`
					parameters.path = items.path
					return `${apiUrl}?${qs.stringify(parameters)}`
				}
			} else if (items.constructor === Array) {
				apiUrl = `${this.baseUrl}batch`
				const pathArray = items.map((o) => {
					return o.path
				})
				path = pathArray.join(',')
				parameters.files = path
				return `${apiUrl}?${qs.stringify(parameters)}`
			}
		},

		// check if has thumb
		hasThumb(item) {
			if (item.is_dir) {
				return false
			} else {
				const ext = this.getFileExt(item)
				return hasThumbImageType.includes(ext.toLowerCase())
			}
		},

		// Get Image Thumb URL
		getThumbUrl(item) {
			const apiUrl = `${this.baseUrl}image?`
			const parameters = {
				path: item.path,
				token: this.$store.state.access_token,
				type: 'thumbnail',
			}
			return apiUrl + qs.stringify(parameters)
		},

		/**
		 * @description: Open Context Menu
		 * @param {Object,Object} event item
		 * @return {void}
		 */
		openContextMenu(e, item) {
			if (item) {
				e.cancelBubble = true
				document.dispatchEvent(new CustomEvent('contextmenu'))
			}
			this.$refs.ctxMenu.open(e, item)
		},
		/**
		 * @description: Copy Or Cut File
		 * @param {string} type
		 * @param {Object,Array} items
		 * @return {void}
		 */
		operate(type, items) {
			const operateObject = {
				type,
			}
			if (items.constructor === Object) {
				operateObject.item = [
					{
						from: items.path,

					},
				]
			} else if (items.constructor === Array) {
				operateObject.item = items.map((o) => {
					return {
						from: o.path,
					}
				})
			}
			this.$store.commit('SET_OPERATE_OBJECT', operateObject)
			if (this.$refs.dropDown !== undefined) {
				this.$refs.dropDown.toggle()
			}
		},

		/**
		 * @description: Permanently delete the selected files or folders
		 * @param {Object,Array} items
		 * @return {void}
		 */
		deleteItem(items) {
			const deleteShare = async (shareId) => {
				try {
					await this.$api.samba.deleteShare(shareId)
				} catch (e) {
					console.log(`${e} in delete shortcut`)
				}
			}

			const deleteShortcut = async (item) => {
				try {
					await deleteShare(item.extensions.share.id)
				} catch (e) {
					console.log(`${e} in delete shortcut`)
				}
			}

			const reload = () => {
				if (this.$refs.dropDown !== undefined) {
					this.$refs.dropDown.isActive = false
					this.$emit('reload')
				}
				if (typeof this.reload === 'function') {
					this.reload()
				}
			}

			// the paths are gone from where they were: their shortcuts go, and the list is read again
			const removed = async (paths) => {
				const shortcuts = this.$store.state.shortcutData
				const remaining = shortcuts.filter((item) => {
					if (paths.includes(item.path)) {
						deleteShortcut(item)
						return false
					}
					return item.type === 'file' || !paths.some(path => item.path.startsWith(`${path}/`))
				})
				if (remaining.length !== shortcuts.length)
					await this.$store.dispatch('SET_SHORTCUT_DATA', remaining)
				reload()
			}

			const deleteItems = async (paths) => {
				try {
					const res = await this.$api.batch.delete(JSON.stringify(paths))
					if (res.data.success === 200) {
						await removed(paths)
					} else {
						this.$buefy.toast.open({
							message: escape(res.data.message),
							type: 'is-danger',
						})
					}
				} catch (e) {
					const data = e?.response?.data
					if (data?.message) {
						this.$buefy.toast.open({ message: escape(data.message), type: 'is-danger' })
					}
					reload()
					console.log(`${e} in deleteItem`)
				}
			}

			let paths = []
			if (items.constructor === Object) {
				paths = [items.path]
			} else if (items.constructor === Array) {
				paths = items.map(o => o.path)
			}

			deleteItems(paths)
		},

		toFahrenheit(value) {
			return (32 + value * 1.8).toFixed(1)
		},

		/**
		 * @description: SMART health of a disk payload: 'passed', 'failed' or
		 * 'unavailable'. A LocalStorage without `smart_status` only has the
		 * `health` Boolean, which then decides between passed and failed.
		 */
		smartHealth(disk) {
			if (disk && typeof disk.smart_status === 'string') {
				return disk.smart_status
			}
			// an older LocalStorage: sys_disk carries a bool, /v1/disks the string "true"/"false"
			return disk && (disk.health === true || disk.health === 'true') ? 'passed' : 'failed'
		},

		getProgressType(per) {
			if (per >= 0 && per < 80) {
				return 'is-primary'
			} else if (per >= 80 && per < 90) {
				return 'is-warning'
			} else {
				return 'is-danger'
			}
		},

		dateFmt(value) {
			const fileDate = new Date(value)
			const currentDate = new Date()
			const isSameYear = fileDate.getFullYear() === currentDate.getFullYear()

			// 获取当前语言环境，默认为浏览器语言
			const locale = (window.localStorage.getItem('lang') || navigator.language || 'en').replace('_', '-')

			if (isSameYear) {
				// 当前年份：只显示月日和时间
				return new Intl.DateTimeFormat(locale, {
					month: 'long',
					day: 'numeric',
					hour: '2-digit',
					minute: '2-digit',
					hour12: false,
				}).format(fileDate)
			}
			// 不同年份：显示完整日期和时间
			return new Intl.DateTimeFormat(locale, {
				year: 'numeric',
				month: 'long',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit',
				hour12: false,
			}).format(fileDate)
		},
		coverType(item) {
			return item.is_dir ? 'folder-cover' : 'file-cover'
		},
		iconType(item) {
			return item.is_dir ? 'folder-icon' : 'files-icon'
		},
	},
}
