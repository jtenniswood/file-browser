<template>
	<form class="modal-card folder-icon-picker" :aria-busy="saving" @submit.prevent="save">
		<header class="modal-card-head">
			<h3 class="title is-header mb-0">{{ $t('Change folder icon') }}</h3>
		</header>
		<section class="modal-card-body">
			<fieldset :disabled="saving">
				<legend class="has-text-weight-semibold mb-3">{{ item.name }}</legend>
				<div class="folder-icon-options">
					<label v-for="option in options" :key="option.id">
						<input v-model="selected" class="is-sr-only" type="radio" name="folder-icon" :value="option.id">
						<span class="folder-icon-option">
							<img :src="option.src" width="44" height="44" alt="">
							<span>{{ $t(option.label) }}</span>
						</span>
					</label>
				</div>
			</fieldset>
			<p v-if="error" class="has-text-danger mt-3" role="alert">{{ error }}</p>
		</section>
		<footer class="modal-card-foot is-justify-content-flex-end">
			<b-button :disabled="saving" rounded @click="$emit('close')">{{ $t('Cancel') }}</b-button>
			<b-button :disabled="selected === initial" :loading="saving" native-type="submit" rounded type="is-primary">
				{{ $t('Save') }}
			</b-button>
		</footer>
	</form>
</template>

<script>
import { customFolderIcon, folderIconOptions } from '../folderIcons'
import { mixin } from '@/mixins/mixin'

export default {
	mixins: [mixin],
	props: {
		item: { type: Object, required: true },
	},
	emits: ['close', 'save'],
	data() {
		const initial = customFolderIcon(this.item.folder_icon) ? this.item.folder_icon : null
		return {
			initial,
			selected: initial,
			saving: false,
			error: '',
		}
	},
	computed: {
		options() {
			return [
				{ id: null, label: 'Automatic', src: this.getIconFile({ ...this.item, folder_icon: null }) },
				...folderIconOptions.map(([id, label]) => ({ id, label, src: customFolderIcon(id) })),
			]
		},
	},
	methods: {
		async save() {
			if (this.saving || this.selected === this.initial)
				return
			this.saving = true
			this.error = ''
			try {
				const icon = this.selected
				const response = await this.$api.folder.setIcon(this.item.path, icon)
				if (response.data.success !== 200) {
					this.error = response.data.message || this.$t('Could not save the folder icon.')
					return
				}
				this.$emit('save', icon)
				this.$emit('close')
			} catch (error) {
				this.error = error.response?.data?.message || this.$t('Could not save the folder icon.')
			} finally {
				this.saving = false
			}
		},
	},
}
</script>

<style scoped>
.folder-icon-picker {
	width: min(32rem, calc(100vw - 2rem));
}

.folder-icon-picker legend {
	overflow-wrap: anywhere;
}

.folder-icon-options {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(5.75rem, 1fr));
	gap: 0.5rem;
}

.folder-icon-options label {
	position: relative;
}

.folder-icon-option {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.25rem;
	height: 100%;
	padding: 0.5rem 0.25rem;
	border: 1px solid var(--bulma-border);
	border-radius: 0.5rem;
	cursor: pointer;
	font-size: 0.875rem;
	line-height: 1.25;
	text-align: center;
	overflow-wrap: anywhere;
}

.folder-icon-option:hover,
input:checked + .folder-icon-option {
	background: var(--bulma-scheme-main-bis);
}

input:checked + .folder-icon-option {
	border-color: var(--bulma-primary);
	box-shadow: inset 0 0 0 1px var(--bulma-primary);
}

input:focus-visible + .folder-icon-option {
	outline: 2px solid var(--bulma-primary);
	outline-offset: 2px;
}
</style>
