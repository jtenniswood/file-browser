import { automaticFolderIcon } from '../automaticFolderIcon.js'

const miniFolderIcons = {
	application: 'display-applications-outline',
	default: 'folder-outline',
	documents: 'files-outline',
	download: 'downloads-outline',
	hdd: 'storage-other',
	pictures: 'gallery-outline',
	root: 'root-outline',
	usb: 'usb-outline',
	video: 'media-outline',
}

function shortcutIcon(item, entry, isFile) {
	// Keep explicit icons from existing shortcuts, including those set by the pin-sidepanel mod.
	if (item.icon && item.icon !== 'folder' && (isFile || item.icon !== miniFolderIcons.default))
		return item.icon
	if (isFile)
		return 'files-outline'

	return entry ? miniFolderIcons[automaticFolderIcon(entry)] : miniFolderIcons.default
}

export const parentOf = path => path.replace(/\/[^/]*$/, '') || '/'

export const SIDEBAR_ORDER_STORAGE_KEY = 'casaos-files-sidebar-order'

export function savedSidebarOrder(key = SIDEBAR_ORDER_STORAGE_KEY) {
	try {
		const order = JSON.parse(localStorage.getItem(key))
		return Array.isArray(order) ? order : []
	} catch {
		return []
	}
}

export function saveSidebarOrder(key, order) {
	try {
		localStorage.setItem(key, JSON.stringify(order))
	} catch {}
}

export function orderSidebarItems(folders, starred, order) {
	const entries = new Map(folders.filter(item => item.visible).map(item => [item.path, item]))
	for (const item of starred) {
		entries.set(item.path, { ...(entries.get(item.path) || item), starred: true })
	}
	return orderSidebarPaths(entries, order)
}

export function orderSidebarPaths(entries, order) {
	const ordered = []
	for (const path of order) {
		if (entries.has(path)) {
			ordered.push(entries.get(path))
			entries.delete(path)
		}
	}
	return [...ordered, ...entries.values()]
}

/**
 * The Starred entries as the sidebar shows them: each one is looked up in a listing of its parent
 * folder (one listing per parent). A folder pin is omitted when its path no longer points to a folder.
 * @param {Array} items the saved entries: { name, path, type: 'folder' | 'file', ... }
 * @param {Function} listFolder path => Promise of the folder's entries ({ path, is_dir, extensions, ... })
 * @return {Promise<Array>} new objects; `entry` is the listing entry when the item was found
 */
export async function checkStarred(items, listFolder) {
	const listings = {}
	await Promise.all([...new Set(items.map(item => parentOf(item.path)))].map(async (parent) => {
		try {
			const listing = await listFolder(parent)
			if (Array.isArray(listing))
				listings[parent] = listing
		} catch (error) {
			if (error?.response?.status === 404)
				listings[parent] = []
		}
	}))
	return items.flatMap((item) => {
		const isFile = item.type === 'file'
		const listing = listings[parentOf(item.path)]
		const entry = listing?.find(e => e.path === item.path && Boolean(e.is_dir) !== isFile)
		if (!isFile && listing && !entry)
			return []
		return [{
			...item,
			icon: shortcutIcon(item, entry, isFile),
			pack: 'casa',
			visible: true,
			unavailable: !entry,
			entry: entry || null,
			extensions: entry ? entry.extensions : null,
		}]
	})
}
