<template>
	<main class="files-account-page files-account-center">
		<section class="files-account-card files-account-form" aria-labelledby="files-sign-in-title">
			<p class="has-text-weight-semibold mb-2">File Browser</p>
			<h1 id="files-sign-in-title" class="title is-4 mb-3">{{ title }}</h1>
			<p v-if="needsSetup" class="mb-5">This account can manage users and access the Files folder.</p>
			<p v-else-if="requiresCode" class="mb-5">Enter a code from your authenticator app or use one of your recovery codes.</p>
			<form @submit.prevent="submit">
				<div v-show="!requiresCode" class="field">
					<label class="label" for="files-user">Username</label>
					<input id="files-user" ref="usernameField" v-model="username" class="input" autocomplete="username"
						autocapitalize="none" :disabled="requiresCode" maxlength="40" required>
				</div>
				<div v-show="!requiresCode" class="field">
					<label class="label" for="files-password">Password</label>
					<input id="files-password" v-model="password" class="input" type="password" :disabled="requiresCode"
						:autocomplete="needsSetup ? 'new-password' : 'current-password'" :minlength="needsSetup ? 12 : undefined" required>
					<p v-if="needsSetup" class="help">Use at least 12 characters.</p>
				</div>
				<div v-if="needsSetup" class="field">
					<label class="label" for="files-confirm">Confirm password</label>
					<input id="files-confirm" v-model="confirmation" class="input" type="password" autocomplete="new-password" required>
				</div>
				<div v-if="needsSetup && setupCodeRequired" class="field">
					<label class="label" for="files-setup-code">Setup code</label>
					<input id="files-setup-code" v-model="setupCode" class="input" autocomplete="off" maxlength="32" required>
					<p class="help">Find the setup code in the server logs with <code>docker compose logs files</code>.</p>
				</div>
				<div v-if="requiresCode" class="field">
					<label class="label" for="files-sign-in-code">Authenticator or recovery code</label>
					<input id="files-sign-in-code" ref="factorField" v-model="code" class="input" autocomplete="one-time-code" maxlength="23" required>
				</div>
				<p v-if="error" class="help is-danger mt-3" role="alert">{{ error }}</p>
				<button class="button is-primary is-fullwidth mt-5" :class="{ 'is-loading': busy }" :disabled="busy" type="submit">
					{{ needsSetup ? 'Create administrator' : 'Sign in' }}
				</button>
				<button v-if="requiresCode" class="button is-ghost is-fullwidth mt-2" :disabled="busy" type="button" @click="resetCode">
					Back to sign in
				</button>
			</form>
		</section>
	</main>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { filesAccountRequest } from '@/service/filesAccounts'

const props = defineProps({ needsSetup: Boolean, setupCodeRequired: Boolean })
const emit = defineEmits(['complete', 'refresh'])
const username = ref('')
const password = ref('')
const confirmation = ref('')
const setupCode = ref('')
const code = ref('')
const requiresCode = ref(false)
const error = ref('')
const busy = ref(false)
const usernameField = ref(null)
const factorField = ref(null)
const title = computed(() => {
	if (props.needsSetup)
		return 'Set up your administrator account'
	return requiresCode.value ? 'Verify your sign-in' : 'Sign in'
})

onMounted(() => usernameField.value?.focus())

function resetCode() {
	requiresCode.value = false
	password.value = ''
	code.value = ''
	error.value = ''
	nextTick(() => usernameField.value?.focus())
}

async function submit() {
	if (busy.value)
		return
	error.value = ''
	if (props.needsSetup && password.value !== confirmation.value) {
		error.value = 'The passwords do not match.'
		return
	}
	busy.value = true
	try {
		const result = await filesAccountRequest(props.needsSetup ? 'setup' : 'login', {
			method: 'POST',
			body: { username: username.value.trim(), password: password.value, code: code.value.trim(), setupCode: setupCode.value.trim() },
		})
		if (result.requiresCode) {
			requiresCode.value = true
			nextTick(() => factorField.value?.focus())
			return
		}
		emit('complete', result.user)
	} catch (cause) {
		if (cause.status === 409 && props.needsSetup) {
			emit('refresh')
		} else {
			error.value = cause.message
			code.value = ''
		}
	} finally {
		busy.value = false
	}
}
</script>
