<template>
	<div class="overlay">
		<header class="modal-card-head">
			<div class="is-flex is-flex-grow-1 is-flex-shrink-1">
				<h3 class="title is-5 one-line mr-4">{{ item.name }}</h3>
			</div>
			<div class="is-flex is-align-items-center is-flex-shrink-0">
				<b-button :label="$t('Download')" :aria-label="$t('Download')" class="mr-2" icon-left="download" rounded
					size="is-small" type="is-primary" @click="download" />
				<button type="button" class="close-button" :aria-label="$t('Close')" @click="close">
					<b-icon icon="close-outline" pack="casa" />
				</button>
			</div>
		</header>

		<div class="v-container psd-preview">
			<div v-show="status === 'ready'" ref="image" class="psd-image" role="img" :aria-label="item.name"></div>
			<p v-if="status === 'loading'" role="status">{{ $t('Loading...') }}</p>
			<p v-else-if="status === 'error'" role="alert">{{ $t('The preview could not be loaded.') }}</p>
		</div>
	</div>
</template>

<script>
import { readPsd } from 'ag-psd'
import { mixin } from '@/mixins/mixin'

const maxFileBytes = 256 * 1024 * 1024
const maxPixels = 32 * 1024 * 1024
const maxCanvasSide = 8192

function decodePreview(bytes) {
	if (bytes.byteLength < 26 || bytes.byteLength > maxFileBytes)
		throw new Error('Invalid PSD preview size')

	const header = new DataView(bytes)
	const height = header.getUint32(14)
	const width = header.getUint32(18)
	// Check the signature, PSD version and dimensions before allocating pixels.
	if (header.getUint32(0) !== 0x38425053 || header.getUint16(4) !== 1
		|| !width || !height || width > maxCanvasSide || height > maxCanvasSide || width * height > maxPixels) {
		throw new Error('Unsupported PSD preview header')
	}

	const { canvas, imageResources } = readPsd(bytes, {
		skipLayerImageData: true,
		skipThumbnail: true,
		imageResourcesWhitelist: ['versionInfo'],
	})
	if (!canvas || imageResources?.versionInfo?.hasRealMergedData === false)
		throw new Error('PSD has no composite image')

	return canvas
}

export default {
	mixins: [mixin],
	props: {
		item: { type: Object, required: true },
		list: Array,
	},
	emits: ['close'],
	data() {
		return { status: 'loading', request: null }
	},
	watch: {
		item() {
			this.loadPreview()
		},
	},
	mounted() {
		this.loadPreview()
	},
	beforeUnmount() {
		this.request?.abort()
	},
	methods: {
		async loadPreview() {
			this.request?.abort()
			const request = new AbortController()
			this.request = request
			this.status = 'loading'
			this.$refs.image.replaceChildren()

			try {
				if (this.item.size > maxFileBytes)
					throw new Error('PSD file is too large to preview')

				const response = await fetch(this.getFileUrl(this.item), { signal: request.signal })
				if (!response.ok || Number(response.headers.get('content-length')) > maxFileBytes)
					throw new Error('PSD preview request failed')

				const bytes = await response.arrayBuffer()
				if (request.signal.aborted)
					return

				this.$refs.image.replaceChildren(decodePreview(bytes))
				this.status = 'ready'
			} catch {
				if (!request.signal.aborted) {
					this.status = 'error'
					request.abort()
				}
			}
		},
		close() {
			this.request?.abort()
			this.$emit('close')
		},
	},
}
</script>

<style scoped>
.close-button {
	padding: 0;
	border: 0;
	background: transparent;
	color: inherit;
}

.psd-preview {
	display: grid;
	place-items: center;
	padding: 1rem;
	text-align: center;
}

.psd-image {
	position: absolute;
	inset: 1rem;
}

.psd-image :deep(canvas) {
	position: absolute;
	inset: 0;
	margin: auto;
	max-width: 100%;
	max-height: 100%;
	object-fit: contain;
}
</style>
