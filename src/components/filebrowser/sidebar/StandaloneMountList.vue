<template>
	<section v-if="paths.length" class="sidebar-mounts" aria-labelledby="standalone-mounts-title">
		<h4 id="standalone-mounts-title" class="sidebar-group-title">{{ $t('Mount points') }}</h4>
		<draggable v-model="mountItems" :animation="180" :delay="160" :delay-on-touch-only="true"
			class="ul" ghost-class="sidebar-drag-ghost" item-key="path">
			<template #item="{ element: item, index }">
				<tree-list-item :is-active="isActive" :item="item" class="mount-point" role="link" tabindex="0"
					aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" :title="$t('Drag to reorder, or use Alt + Up or Down')"
					@keydown.alt.up.prevent="move(index, -1)" @keydown.alt.down.prevent="move(index, 1)"
					@keydown.enter.prevent="filePanel.getFileList(item.path)" />
			</template>
		</draggable>
	</section>
</template>

<script>
import Draggable from 'vuedraggable'
import TreeListItem from './TreeListItem.vue'
import { orderSidebarPaths, saveSidebarOrder, savedSidebarOrder } from './starred.js'

const mountOrderKey = 'casaos-files-mount-order'

export default {
	components: { Draggable, TreeListItem },
	inject: ['filePanel'],
	props: {
		paths: { type: Array, required: true },
		isActive: Boolean,
	},
	data() {
		return { mountOrder: savedSidebarOrder(mountOrderKey) }
	},
	computed: {
		mountItems: {
			get() {
				const entries = new Map(this.paths.map(path => [path, {
					name: path.split('/').pop(),
					path,
					icon: 'storage-other',
					pack: 'casa',
					visible: true,
				}]))
				return orderSidebarPaths(entries, this.mountOrder)
			},
			set(items) {
				const paths = items.map(item => item.path)
				const visible = new Set(paths)
				let index = 0
				// Keep slots for temporarily disconnected mounts.
				const order = this.mountOrder.map(path => visible.has(path) ? paths[index++] : path)
				this.mountOrder = [...order, ...paths.slice(index)]
				saveSidebarOrder(mountOrderKey, this.mountOrder)
			},
		},
	},
	methods: {
		move(from, offset) {
			const items = this.mountItems
			const to = from + offset
			if (to >= 0 && to < items.length) {
				items.splice(to, 0, ...items.splice(from, 1))
				this.mountItems = items
			}
		},
	},
}
</script>

<style scoped>
.sidebar-mounts:not(:first-child) {
	margin-top: 0.75rem;
}

.mount-point :deep(.list-item) {
	cursor: grab;
}

.mount-point:focus-visible {
	outline: 2px solid currentColor;
	outline-offset: -2px;
	border-radius: 4px;
}

.sidebar-drag-ghost {
	opacity: 0.4;
}
</style>
