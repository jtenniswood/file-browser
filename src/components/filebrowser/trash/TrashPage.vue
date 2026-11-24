<template>
	<div class="trash-page content is-flex-grow-1 is-flex is-flex-direction-column">
		<!-- Header Start -->
		<header class="modal-card-head">
			<sidebar-menu-button></sidebar-menu-button>
			<div class="is-flex-grow-1 is-flex breadcrumb-container">
				<h3 class="title is-header mb-0">{{ $t('Trash') }}</h3>
			</div>
			<b-button :disabled="items.length === 0" class="mr-2" icon-left="delete-forever-outline" rounded
				size="is-small" type="is-danger" @click="confirmEmpty">{{ $t('Empty the trash') }}</b-button>
			<b-icon v-if="!$standaloneFiles" class="close-button" icon="close-outline" pack="casa" @click="$emit('close')" />
		</header>
		<!-- Header End -->

		<div class="trash-list scroll-container scrollbars-light is-flex-grow-1">
			<div class="tool-bar trash-summary is-flex is-align-items-center my-2">
				<p class="is-size-7 mb-0">
					{{ $t('{size} in the trash. Items are deleted for good after {days} days.', { size: renderSize(size), days }) }}
				</p>
			</div>

			<b-message v-if="error" class="mx-5" size="is-small" type="is-danger">{{ error }}</b-message>

			<div v-else-if="items.length" :aria-busy="isLoading" :aria-label="$t('Trash')" class="node-list trash-table" role="table">
				<div class="table-thead" role="rowgroup">
					<div class="tr-wrapper" role="presentation">
						<div class="tr trash-row" role="row">
							<div class="th" role="columnheader">{{ $t('Name') }}</div>
							<div class="th trash-meta" role="columnheader">{{ $t('Deleted from') }}</div>
							<div class="th trash-meta" role="columnheader">{{ $t('Deleted on') }}</div>
							<div class="th trash-meta" role="columnheader">{{ $t('Size') }}</div>
							<div class="th" role="columnheader"><span class="is-sr-only">{{ $t('Actions') }}</span></div>
						</div>
					</div>
				</div>

				<div class="tbody" role="rowgroup">
					<div v-for="{ row, name, folder, date, formattedSize } in displayItems"
						:key="JSON.stringify([row.trash, row.name])" class="tr-wrapper" role="presentation">
						<div class="tr trash-row" role="row">
							<div class="td" role="cell">
								<div class="cover">
									<img :src="getIconFile({ name, is_dir: row.is_dir, folder_icon: row.folder_icon })" alt="">
								</div>
								<div class="trash-name">
									<div :title="name" class="one-line">{{ name }}</div>
									<div class="trash-details is-size-7">
										<div :title="folder" class="one-line">{{ folder }}</div>
										<div class="trash-date-size is-flex is-flex-wrap-wrap">
											<span>{{ date }}</span>
											<span>{{ formattedSize }}</span>
										</div>
									</div>
								</div>
							</div>
							<div class="td trash-meta is-size-7" role="cell">
								<span :title="folder" class="one-line">{{ folder }}</span>
							</div>
							<div class="td trash-meta is-size-7" role="cell">
								<span :title="date" class="one-line">{{ date }}</span>
							</div>
							<div class="td trash-meta is-size-7" role="cell">{{ formattedSize }}</div>
							<div class="td trash-actions is-justify-content-flex-end" role="cell">
								<b-button :loading="busy === row" rounded size="is-small" @click="restore(row)">{{ $t('Restore') }}</b-button>
								<b-button :aria-label="$t('Delete permanently')" :disabled="busy === row" :title="$t('Delete permanently')"
									icon-left="delete-forever-outline" rounded size="is-small" type="is-danger is-light" @click="confirmDelete(row)" />
							</div>
						</div>
					</div>
				</div>
			</div>

			<p v-else-if="!isLoading" class="has-text-centered has-text-grey py-6">{{ $t('The trash is empty.') }}</p>
		</div>
		<b-loading v-model="isLoading" :is-full-page="false" />
	</div>
</template>

<script>
import { defineAsyncComponent } from 'vue'
import escape from 'lodash/escape'
import { mixin } from '@/mixins/mixin'

export default {
	name: 'trash-page',
	components: {
		SidebarMenuButton: defineAsyncComponent(() => import('../components/SidebarMenuButton.vue')),
	},
	mixins: [mixin],
	data() {
		return {
			items: [],
			size: 0,
			days: 30,
			isLoading: true,
			error: '',
			busy: null,
		}
	},
	computed: {
		displayItems() {
			return this.items.map(row => ({
				row,
				name: this.baseName(row.path),
				folder: this.folderOf(row.path),
				date: this.deletedOn(row),
				formattedSize: this.renderSize(row.size),
			}))
		},
	},
	mounted() {
		this.load()
	},
	methods: {
		baseName(path) {
			return path.slice(path.lastIndexOf('/') + 1)
		},
		folderOf(path) {
			return path.slice(0, path.lastIndexOf('/')) || '/'
		},
		deletedOn(row) {
			const when = new Date(row.deleted_at)
			// an item whose deletion date cannot be read comes with Go's zero time
			return when.getFullYear() > 1 ? this.dateFmt(when) : '—'
		},
		ref(row) {
			return [{ trash: row.trash, name: row.name }]
		},
		// Buefy shows toasts and dialogs as HTML, and a file name can hold markup
		failed(e) {
			this.$buefy.toast.open({ message: escape(e?.response?.data?.message || String(e)), type: 'is-danger' })
		},
		async load() {
			this.isLoading = true
			try {
				const res = await this.$api.file.trash()
				const data = res.data.data
				this.items = data.items || []
				this.size = data.size || 0
				this.days = data.retention_days || this.days
				this.error = ''
			} catch (e) {
				this.items = []
				this.error = e?.response?.data?.message || String(e)
			} finally {
				this.isLoading = false
			}
		},
		async restore(row) {
			this.busy = row
			try {
				const res = await this.$api.file.restoreTrash(this.ref(row))
				this.$buefy.toast.open({ message: this.$t('Restored to {path}', { path: escape(res.data.data[0]) }), type: 'is-success' })
			} catch (e) {
				this.failed(e)
			} finally {
				this.busy = null
				await this.load()
			}
		},
		confirmDelete(row) {
			this.$buefy.dialog.confirm({
				title: this.$t('Delete permanently'),
				message: this.$t('Delete {name} permanently? This cannot be undone.', { name: escape(this.baseName(row.path)) }),
				confirmText: this.$t('Delete permanently'),
				type: 'is-danger',
				hasIcon: true,
				onConfirm: () => this.remove(row),
			})
		},
		async remove(row) {
			this.busy = row
			try {
				await this.$api.file.deleteTrash(this.ref(row))
			} catch (e) {
				this.failed(e)
			} finally {
				this.busy = null
				await this.load()
			}
		},
		confirmEmpty() {
			this.$buefy.dialog.confirm({
				title: this.$t('Empty the trash'),
				message: this.$t('Empty the trash? Everything in it is deleted for good.'),
				confirmText: this.$t('Empty the trash'),
				type: 'is-danger',
				hasIcon: true,
				onConfirm: () => this.empty(),
			})
		},
		async empty() {
			this.isLoading = true
			try {
				await this.$api.file.emptyTrash()
			} catch (e) {
				this.failed(e)
			} finally {
				await this.load()
			}
		},
	},
}
</script>

<style lang="scss" scoped>
.trash-page {
	min-width: 0;
}

.trash-list {
	min-height: 0;
}

.trash-summary.tool-bar {
	min-height: 1.75rem;
	height: auto;
	color: var(--casa-text-secondary);
}

.trash-table .tr-wrapper .trash-row {
	display: grid;
	grid-template-columns: minmax(8rem, 1fr) minmax(0, 13rem) minmax(0, 10rem) 5rem 8rem;
	column-gap: 0.75rem;
	padding-inline: 0.75rem;
	cursor: default;
}

.trash-name {
	min-width: 0;
}

.trash-details {
	display: none;
	color: var(--casa-text-secondary);
}

.trash-actions {
	gap: 0.5rem;
}

@media (max-width: 767.98px) {
	.trash-table .tr-wrapper .trash-row {
		grid-template-columns: minmax(0, 1fr) max-content;
		padding-inline: 0.375rem;

		.trash-meta {
			display: none;
		}

		.td {
			height: auto;
			min-height: 3.25rem;
			padding-block: 0.375rem;

			.cover {
				margin-inline-end: 0.5rem;
			}
		}
	}

	.trash-details {
		display: block;
	}

	.trash-date-size {
		column-gap: 0.5rem;
	}
}
</style>
