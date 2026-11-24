import folderIconLabels from '@/assets/img/filebrowser/folder-icons.json'

export const folderIconOptions = Object.entries(folderIconLabels)

export function isCustomFolderIcon(icon) {
	return typeof icon === 'string' && Object.hasOwn(folderIconLabels, icon)
}

export function customFolderIcon(icon) {
	if (isCustomFolderIcon(icon))
		return require(`@/assets/img/filebrowser/folder-${icon}.svg`)
}
