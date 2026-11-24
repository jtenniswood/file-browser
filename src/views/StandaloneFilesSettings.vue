<template>
	<main class="files-account-page">
		<div class="files-settings">
			<header class="settings-row">
				<div>
					<RouterLink :to="{ name: 'files', query: $route.query }">← Back to files</RouterLink>
					<h1 class="title is-3 mb-0 mt-3">Settings</h1>
				</div>
				<button class="button" type="button" :disabled="busy" @click="signOut">Sign out</button>
			</header>
			<p v-if="error" class="notification is-danger is-light" role="alert">{{ error }}</p>
			<p v-if="notice" class="notification is-success is-light" role="status">{{ notice }}</p>
			<section class="files-account-card settings-row" aria-labelledby="appearance-title">
				<h2 id="appearance-title" class="title is-5 mb-0">{{ $t('Appearance') }}</h2>
				<div class="select">
					<select v-model="theme" aria-labelledby="appearance-title" @change="setThemePreference(theme)">
						<option value="light">{{ $t('Light') }}</option>
						<option value="dark">{{ $t('Dark') }}</option>
						<option value="system">{{ $t('Auto') }}</option>
					</select>
				</div>
			</section>
			<section class="files-account-card" aria-labelledby="account-title">
				<h2 id="account-title" class="title is-5 mb-2">Your account</h2>
				<p class="mb-5">{{ user.username }} · {{ roleLabel(user.role) }}</p>
				<div class="settings-columns">
					<form class="settings-panel" @submit.prevent="changePassword">
						<h3 class="title is-6 mb-4">Change password</h3>
						<input type="hidden" autocomplete="username" :value="user.username">
						<label class="label" for="files-current-password">Current password</label>
						<input id="files-current-password" v-model="currentPassword" class="input mb-3" type="password" autocomplete="current-password" required>
						<label class="label" for="files-new-password">New password</label>
						<input id="files-new-password" v-model="newPassword" class="input" type="password" autocomplete="new-password" minlength="12" required>
						<p class="help mb-4">Use at least 12 characters.</p>
						<button class="button is-primary" :disabled="busy" type="submit">Change password</button>
					</form>
					<div class="settings-panel">
						<h3 class="title is-6 mb-2">Two-factor sign-in</h3>
						<p class="mb-4">{{ user.totp_enabled ? 'On' : 'Off' }}</p>
						<TwoFactorPanel v-if="twoFactorOpen" @change="factorChanged" @done="twoFactorOpen = false" />
						<button v-if="!twoFactorOpen" class="button" type="button" @click="twoFactorOpen = true">
							{{ user.totp_enabled ? 'Manage two-factor sign-in' : 'Set up an authenticator app' }}
						</button>
						<button v-else class="button is-ghost mt-2" type="button" @click="twoFactorOpen = false">Close two-factor settings</button>
					</div>
				</div>
			</section>
			<section v-if="isAdmin" class="files-account-card" aria-labelledby="users-title">
				<h2 id="users-title" class="title is-5 mb-2">Users</h2>
				<p class="mb-5">All users can read and change files in the shared folder. Administrators can also manage accounts.</p>
				<div class="settings-columns">
					<div>
						<p v-if="loadingUsers" role="status">Loading users…</p>
						<button v-if="!loadingUsers && !users.length" class="button" type="button" @click="loadUsers">Reload users</button>
						<ul>
							<li v-for="account in users" :key="account.username" class="settings-row user-row">
								<div>
									<strong>{{ account.username }}{{ account.username === user.username ? ' (you)' : '' }}</strong>
									<p class="is-size-7">{{ roleLabel(account.role) }} · Two-factor {{ account.totp_enabled ? 'on' : 'off' }}</p>
								</div>
								<button v-if="account.username !== user.username" class="button is-small" type="button"
									:aria-label="`Manage ${account.username}`" :aria-expanded="selected?.username === account.username"
									:disabled="busy" @click="selectAccount(account)">Manage</button>
							</li>
						</ul>
					</div>
					<form v-if="!selected" class="settings-panel" @submit.prevent="addUser">
						<h3 class="title is-6 mb-4">Add a user</h3>
						<label class="label" for="files-add-username">Username</label>
						<input id="files-add-username" v-model="newUser.username" class="input mb-3" autocomplete="off" autocapitalize="none" minlength="3" maxlength="40" required>
						<label class="label" for="files-add-password">Password</label>
						<input id="files-add-password" v-model="newUser.password" class="input mb-3" type="password" autocomplete="new-password" minlength="12" required>
						<label class="label" for="files-add-role">Role</label>
						<div class="select mb-4">
							<select id="files-add-role" v-model="newUser.role">
								<option value="member">Member</option>
								<option value="admin">Administrator</option>
							</select>
						</div>
						<div><button class="button is-primary" type="submit" :disabled="busy">Add user</button></div>
					</form>
					<div v-else class="settings-panel">
						<h3 class="title is-6 mb-4">Manage {{ selected.username }}</h3>
						<template v-if="confirmAction">
							<p v-if="confirmAction === 'remove'" class="mb-4">Remove {{ selected.username }} from File Browser?</p>
							<p v-else class="mb-4">Turn off two-factor sign-in for {{ selected.username }}?</p>
							<div class="buttons mb-0">
								<button class="button is-danger" type="button" :disabled="busy" @click="confirmChange">
									{{ confirmAction === 'remove' ? 'Remove user' : 'Turn off two-factor sign-in' }}
								</button>
								<button class="button" type="button" :disabled="busy" @click="confirmAction = ''">Cancel</button>
							</div>
						</template>
						<template v-else>
							<form class="mb-4" @submit.prevent="resetPassword">
								<label class="label" for="files-reset-password">New password</label>
								<input id="files-reset-password" v-model="replacementPassword" class="input mb-3" type="password" autocomplete="new-password" minlength="12" required>
								<button class="button is-primary" type="submit" :disabled="busy">Reset password</button>
							</form>
							<div class="buttons mb-0">
								<button v-if="selected.totp_enabled" class="button" type="button" :disabled="busy" @click="confirmAction = 'factor'">Reset two-factor sign-in</button>
								<button class="button is-danger is-light" type="button" :disabled="busy" @click="confirmAction = 'remove'">Remove user</button>
								<button class="button is-ghost" type="button" :disabled="busy" @click="selectAccount(null)">Done</button>
							</div>
						</template>
					</div>
				</div>
			</section>
		</div>
	</main>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useStore } from 'vuex'
import TwoFactorPanel from '@/components/account/TwoFactorPanel.vue'
import { readThemePreference, setThemePreference } from '@/mixins/app/themePreference'
import { filesAccountRequest, filesSessionExpired } from '@/service/filesAccounts'

const store = useStore()
const router = useRouter()
const user = computed(() => store.state.user)
const isAdmin = computed(() => user.value.role === 'admin')
const theme = ref(readThemePreference(undefined, 'light'))
const users = ref([])
const loadingUsers = ref(isAdmin.value)
const currentPassword = ref('')
const newPassword = ref('')
const newUser = reactive({ username: '', password: '', role: 'member' })
const selected = ref(null)
const replacementPassword = ref('')
const confirmAction = ref('')
const twoFactorOpen = ref(false)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const roleLabel = role => role === 'admin' ? 'Administrator' : 'Member'

onMounted(() => {
	if (isAdmin.value)
		loadUsers()
})

async function loadUsers() {
	loadingUsers.value = true
	try {
		users.value = await filesAccountRequest('users')
	} catch (cause) {
		error.value = cause.message
	} finally {
		loadingUsers.value = false
	}
}

async function run(operation) {
	if (busy.value)
		return
	busy.value = true
	notice.value = ''
	error.value = ''
	try {
		await operation()
	} catch (cause) {
		error.value = cause.message
	} finally {
		busy.value = false
	}
}

function changePassword() {
	return run(async () => {
		await filesAccountRequest('password', { method: 'PUT', body: { currentPassword: currentPassword.value, password: newPassword.value } })
		currentPassword.value = ''
		newPassword.value = ''
		twoFactorOpen.value = false
		notice.value = 'Your password was changed.'
	})
}

function addUser() {
	return run(async () => {
		const added = await filesAccountRequest('users', { method: 'POST', body: { ...newUser, username: newUser.username.trim() } })
		users.value.push(added)
		Object.assign(newUser, { username: '', password: '', role: 'member' })
		notice.value = `${added.username} was added.`
	})
}

function selectAccount(account) {
	selected.value = account
	replacementPassword.value = ''
	confirmAction.value = ''
	newUser.password = ''
}

function resetPassword() {
	return run(async () => {
		const username = selected.value.username
		await filesAccountRequest('users/password', { method: 'PUT', body: { username, password: replacementPassword.value } })
		replacementPassword.value = ''
		notice.value = `Password reset for ${username}.`
	})
}

function confirmChange() {
	return run(async () => {
		const username = selected.value.username
		if (confirmAction.value === 'remove') {
			await filesAccountRequest('users', { method: 'DELETE', body: { username } })
			users.value = users.value.filter(account => account.username !== username)
			selectAccount(null)
			notice.value = `${username} was removed.`
		} else {
			await filesAccountRequest('users/2fa', { method: 'DELETE', body: { username } })
			selected.value.totp_enabled = false
			confirmAction.value = ''
			notice.value = `Two-factor sign-in was reset for ${username}.`
		}
	})
}

function factorChanged(value) {
	store.commit('SET_TOTP_ENABLED', value)
	const ownAccount = users.value.find(account => account.username === user.value.username)
	if (ownAccount)
		ownAccount.totp_enabled = value
}

function signOut() {
	return run(async () => {
		await filesAccountRequest('logout', { method: 'POST' })
		window.dispatchEvent(new Event(filesSessionExpired))
		await router.replace({ name: 'files' })
	})
}
</script>

<style scoped>
.files-settings {
	display: grid;
	gap: 1rem;
	max-width: 58rem;
	margin: 0 auto;
}

.settings-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 1rem;
}

.settings-columns {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 1.5rem;
}

.settings-panel {
	padding: 1rem;
	border: 1px solid var(--bulma-border);
	border-radius: 0.75rem;
}

.user-row {
	padding-block: 0.75rem;
	border-bottom: 1px solid var(--bulma-border);
	overflow-wrap: anywhere;
}

@media (max-width: 42rem) {
	.settings-columns {
		grid-template-columns: minmax(0, 1fr);
	}
}
</style>
