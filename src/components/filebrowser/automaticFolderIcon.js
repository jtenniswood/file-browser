const folderIconsByName = new Map([
	['AppData', 'application'],
	['Documents', 'documents'],
	['Downloads', 'download'],
	['Gallery', 'pictures'],
	['Media', 'video'],
])

export function automaticFolderIcon({ name, type }) {
	if (type === 'application' || type === 'usb')
		return type
	if (['sata', 'nvme', 'spi', 'sas'].includes(type))
		return 'hdd'
	if (type === 'home')
		return 'root'

	return folderIconsByName.get(name) || 'default'
}
