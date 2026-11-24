<template>
	<div class="overlay">
		<header class="modal-card-head">
			<div class="is-flex is-flex-grow-1 is-flex-shrink-1">
				<h3 class="title is-5 one-line mr-4">{{ item.name }}</h3>
			</div>
			<div class="is-flex is-align-items-center is-flex-shrink-0">
				<b-button v-if="status === 'ready'" :label="$t('Reset')" class="mr-2" rounded size="is-small"
					@click="resetView" />
				<b-button :label="$t('Download')" class="mr-2" icon-left="download" rounded size="is-small"
					type="is-primary" @click="download" />
				<button type="button" class="close-button" :aria-label="$t('Close')" @click="close">
					<b-icon icon="close-outline" pack="casa" />
				</button>
			</div>
		</header>

		<div class="v-container stl-preview">
			<canvas ref="canvas" :aria-label="item.name"></canvas>
			<p v-if="status === 'loading'" class="stl-message" role="status">{{ $t('Loading...') }}</p>
			<p v-else-if="status === 'error'" class="stl-message" role="alert">{{ $t('The preview could not be loaded.') }}</p>
		</div>
	</div>
</template>

<script>
import { AmbientLight, DirectionalLight, DoubleSide, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, WebGLRenderer } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import { mixin } from '@/mixins/mixin'

export default {
	mixins: [mixin],
	props: {
		item: { type: Object, required: true },
		list: Array,
	},
	emits: ['close'],
	data() {
		return { status: 'loading' }
	},
	mounted() {
		this.loadPreview()
	},
	beforeUnmount() {
		this.disposePreview?.()
	},
	methods: {
		async loadPreview() {
			const canvas = this.$refs.canvas
			const request = new AbortController()
			let geometry
			let renderer
			let controls
			let material
			let observer
			const contextLost = (event) => {
				event.preventDefault()
				this.status = 'error'
				this.disposePreview()
			}

			this.disposePreview = () => {
				request.abort()
				observer?.disconnect()
				controls?.dispose()
				geometry?.dispose()
				material?.dispose()
				canvas.removeEventListener('webglcontextlost', contextLost)
				renderer?.dispose()
				renderer?.forceContextLoss()
				this.disposePreview = null
				this.resetControls = null
			}

			try {
				const response = await fetch(this.getFileUrl(this.item), { signal: request.signal })
				if (!response.ok)
					throw new Error('STL request failed')
				const bytes = await response.arrayBuffer()
				if (request.signal.aborted)
					return

				// Validate the binary record count before the loader allocates geometry.
				const binary = bytes.byteLength >= 84 && bytes.byteLength === 84 + 50 * new DataView(bytes).getUint32(80, true)
				const data = binary ? bytes : new TextDecoder().decode(bytes).trimStart()
				if (!binary && !data.startsWith('solid'))
					throw new Error('Invalid STL header')

				geometry = new STLLoader().parse(data)
				const positions = geometry.getAttribute('position')
				if (!positions.count || positions.count % 3 || !positions.array.every(Number.isFinite))
					throw new Error('Invalid STL vertices')

				geometry.computeBoundingSphere()
				const { center, radius } = geometry.boundingSphere
				if (!Number.isFinite(radius) || radius <= 0)
					throw new Error('Invalid STL bounds')
				geometry.translate(-center.x, -center.y, -center.z)
				geometry.scale(1 / radius, 1 / radius, 1 / radius)
				geometry.computeVertexNormals()

				const scene = new Scene()
				const camera = new PerspectiveCamera(45, 1, 0.01, 100)
				camera.up.set(0, 0, 1)
				camera.position.set(2.5, -2.5, 1.8)
				material = new MeshStandardMaterial({ color: 0x4B9FEB, side: DoubleSide })
				scene.add(new Mesh(geometry, material), new AmbientLight(0xFFFFFF, 1.25))
				const key = new DirectionalLight(0xFFFFFF, 2.5)
				key.position.set(3, -4, 6)
				scene.add(key)

				renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true })
				renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
				canvas.addEventListener('webglcontextlost', contextLost)
				controls = new OrbitControls(camera, canvas)
				controls.minDistance = 1.1
				controls.maxDistance = 20
				this.resetControls = () => controls.reset()

				const render = () => renderer.render(scene, camera)
				controls.addEventListener('change', render)
				const fit = () => {
					const { clientWidth: width, clientHeight: height } = canvas
					if (width && height) {
						camera.aspect = width / height
						camera.zoom = Math.min(camera.aspect, 1)
						camera.updateProjectionMatrix()
						renderer.setSize(width, height, false)
						render()
					}
				}
				fit()
				observer = new ResizeObserver(fit)
				observer.observe(canvas)
				this.status = 'ready'
			} catch {
				if (!request.signal.aborted) {
					this.disposePreview()
					this.status = 'error'
				}
			}
		},
		resetView() {
			this.resetControls?.()
		},
		close() {
			this.disposePreview?.()
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

.stl-preview canvas {
	display: block;
	width: 100%;
	height: 100%;
}

.stl-message {
	position: absolute;
	inset: 0;
	display: grid;
	place-items: center;
	padding: 1rem;
	text-align: center;
}
</style>
