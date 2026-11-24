import folderIconLabels from '@/assets/img/filebrowser/folder-icons.json'

export const folderIconOptions = Object.entries(folderIconLabels)

export function customFolderIcon(icon) {
	if (typeof icon === 'string' && Object.hasOwn(folderIconLabels, icon))
		return require(`@/assets/img/filebrowser/folder-${icon}.svg`)
}
