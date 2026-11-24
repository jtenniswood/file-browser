<template>
	<template v-if="ready && user">
		<RouterView v-slot="{ Component }">
			<KeepAlive include="FilesTab">
				<component :is="Component" />
			</KeepAlive>
		</RouterView>
	</template>
	<StandaloneSignIn v-else-if="ready" :needs-setup="session.needsSetup" :setup-code-required="session.setupCodeRequired"
		@complete="signIn" @refresh="loadSession" />
	<main v-else class="files-account-page files-account-center">
		<section class="files-account-card files-account-form" aria-live="polite">
			<h1 class="title is-4">Files</h1>
			<template v-if="error">
				<p class="mb-4">{{ error }}</p>
				<button class="button is-primary" type="button" @click="loadSession">Try again</button>
			</template>
			<p v-else>Opening Files…</p>
		</section>
	</main>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useStore } from 'vuex'
import StandaloneSignIn from './StandaloneSignIn.vue'
import { filesAccountRequest, filesSessionExpired } from '@/service/filesAccounts'

const store = useStore()
const session = ref(null)
const user = ref(null)
const ready = ref(false)
const error = ref('')
let loading = false

function signIn(account) {
	user.value = account
	store.commit('SET_USER', account)
}

async function loadSession() {
	if (loading)
		return
	loading = true
	error.value = ''
	try {
		session.value = await filesAccountRequest('session')
		if (session.value.user) {
			signIn(session.value.user)
		} else {
			user.value = null
			store.commit('CLEAR_USER')
			store.commit('SET_OPERATE_OBJECT', null)
		}
		ready.value = true
	} catch (cause) {
		error.value = cause.message
		ready.value = false
	} finally {
		loading = false
	}
}

onMounted(() => {
	window.addEventListener(filesSessionExpired, loadSession)
	loadSession()
})
onBeforeUnmount(() => window.removeEventListener(filesSessionExpired, loadSession))
</script>

<style>
.files-account-page {
	height: 100%;
	overflow-y: auto;
	padding: clamp(1rem, 4vw, 3rem);
	background: var(--bulma-scheme-main-bis);
	color: var(--bulma-text);
}

.files-account-center {
	display: grid;
	justify-items: center;
	align-items: safe center;
}

.files-account-card {
	padding: clamp(1.25rem, 4vw, 2rem);
	background: var(--bulma-scheme-main);
	border: 1px solid var(--bulma-border);
	border-radius: 1rem;
}

.files-account-form {
	width: min(100%, 25rem);
}
</style>
