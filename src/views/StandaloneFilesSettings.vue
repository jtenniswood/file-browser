<template>
	<div class="settings-page">
		<header class="settings-header">
			<nav class="breadcrumb has-succeeds-separator mb-0" aria-label="Breadcrumb">
				<ul>
					<li><RouterLink :to="{ name: 'files', query: $route.query }">{{ $t('Files') }}</RouterLink></li>
					<li><h1 id="settings-title" class="title is-header mb-0" aria-current="page">{{ $t('Settings') }}</h1></li>
				</ul>
			</nav>
		</header>

		<nav class="settings-nav scrollbars-light" aria-label="Settings sections">
			<button class="settings-nav-link" type="button" @click="jumpToSection('preferences-title')">
				<b-icon icon="tune-variant" aria-hidden="true" />
				Preferences
			</button>
			<button class="settings-nav-link" type="button" @click="jumpToSection('account-title')">
				<b-icon icon="account-outline" aria-hidden="true" />
				Your account
			</button>
			<button v-if="isAdmin" class="settings-nav-link" type="button" @click="jumpToSection('users-title')">
				<b-icon icon="account-multiple-outline" aria-hidden="true" />
				Users
			</button>
		</nav>

		<main class="settings-main scrollbars-light" aria-labelledby="settings-title">
			<div class="settings-content">
				<p v-if="error" class="notification is-danger is-light" role="alert">{{ error }}</p>
				<p v-if="notice" class="notification is-success is-light" role="status">{{ notice }}</p>
				<section class="settings-section" aria-labelledby="preferences-title">
					<h2 id="preferences-title" class="title is-5 mb-3" tabindex="-1">Preferences</h2>
					<div class="settings-group">
						<div class="settings-row preference-row">
							<div>
								<h3 id="appearance-title" class="setting_title">{{ $t('Appearance') }}</h3>
								<p class="help settings-description">Choose how Files looks on this device.</p>
							</div>
							<div class="theme-options" role="radiogroup" aria-labelledby="appearance-title">
								<label v-for="option in themeOptions" :key="option.value">
									<input v-model="theme" class="is-sr-only" type="radio" name="files-theme" :value="option.value"
										@change="setThemePreference(option.value)">
									<span class="button is-small">
										<span class="icon" aria-hidden="true"><i class="mdi" :class="option.icon" /></span>
										<span>{{ $t(option.label) }}</span>
									</span>
								</label>
							</div>
						</div>
						<div class="settings-row preference-row">
							<div>
								<h3 id="hidden-files-title" class="setting_title">{{ $t('Show hidden files') }}</h3>
								<p class="help settings-description">Include items whose names start with a dot.</p>
							</div>
							<b-switch aria-labelledby="hidden-files-title" :model-value="store.state.showHiddenFiles"
								@update:model-value="store.commit('SET_SHOW_HIDDEN_FILES', $event)" />
						</div>
					</div>
				</section>
				<section class="settings-section" aria-labelledby="account-title">
					<h2 id="account-title" class="title is-5 mb-3" tabindex="-1">Your account</h2>
					<div class="account-summary">
						<strong>{{ user.username }}</strong>
						<span class="tag">{{ roleLabel(user.role) }}</span>
					</div>
					<div class="settings-columns">
						<form class="settings-group" @submit.prevent="changePassword">
							<h3 class="title is-6 mb-4">Change password</h3>
							<input type="hidden" autocomplete="username" :value="user.username">
							<label class="label" for="files-current-password">Current password</label>
							<input id="files-current-password" v-model="currentPassword" class="input mb-3" type="password" autocomplete="current-password" required>
							<label class="label" for="files-new-password">New password</label>
							<input id="files-new-password" v-model="newPassword" class="input" type="password" autocomplete="new-password" minlength="12" required>
							<p class="help mb-4">Use at least 12 characters.</p>
							<button class="button is-primary" :disabled="busy" type="submit">Change password</button>
						</form>
						<div class="settings-group">
							<div class="settings-row factor-heading">
								<h3 class="title is-6 mb-0">Two-factor sign-in</h3>
								<span class="tag" :class="{ 'is-success is-light': user.totp_enabled }">{{ user.totp_enabled ? 'On' : 'Off' }}</span>
							</div>
							<TwoFactorPanel v-if="twoFactorOpen" @change="factorChanged" @done="twoFactorOpen = false" />
							<button v-if="!twoFactorOpen" class="button" type="button" @click="twoFactorOpen = true">
								{{ user.totp_enabled ? 'Manage two-factor sign-in' : 'Set up an authenticator app' }}
							</button>
							<button v-else class="button is-ghost mt-2" type="button" @click="twoFactorOpen = false">Close two-factor settings</button>
						</div>
					</div>
				</section>
				<section v-if="isAdmin" class="settings-section" aria-labelledby="users-title">
					<h2 id="users-title" class="title is-5 mb-3" tabindex="-1">Users</h2>
					<p class="help settings-description mb-4">All users can read and change files in the shared folder. Administrators can also manage accounts.</p>
					<div class="settings-columns">
						<div class="settings-group">
							<h3 class="title is-6 mb-2">User accounts</h3>
							<p v-if="loadingUsers" role="status">Loading users…</p>
							<button v-if="!loadingUsers && !users.length" class="button" type="button" @click="loadUsers">Reload users</button>
							<ul>
								<li v-for="account in users" :key="account.username" class="settings-row user-row">
									<div>
										<strong>{{ account.username }}{{ account.username === user.username ? ' (you)' : '' }}</strong>
										<p class="help settings-description">{{ roleLabel(account.role) }} · Two-factor {{ account.totp_enabled ? 'on' : 'off' }}</p>
									</div>
									<button v-if="account.username !== user.username" class="button is-small" type="button"
										:aria-label="`Manage ${account.username}`" :aria-expanded="selected?.username === account.username"
										:disabled="busy" @click="selectAccount(account)">Manage</button>
								</li>
							</ul>
						</div>
						<form v-if="!selected" class="settings-group" @submit.prevent="addUser">
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
						<div v-else class="settings-group">
							<h3 class="title is-6 mb-4">Manage {{ selected.username }}</h3>
							<template v-if="confirmAction">
								<p v-if="confirmAction === 'remove'" class="mb-4">Remove {{ selected.username }} from Files?</p>
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
	</div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useStore } from 'vuex'
import TwoFactorPanel from '@/components/account/TwoFactorPanel.vue'
import { readThemePreference, setThemePreference } from '@/mixins/app/themePreference'
import { filesAccountRequest } from '@/service/filesAccounts'

const store = useStore()
const user = computed(() => store.state.user)
const isAdmin = computed(() => user.value.role === 'admin')
const theme = ref(readThemePreference(undefined, 'light'))
const themeOptions = [
	{ value: 'light', label: 'Light', icon: 'mdi-white-balance-sunny' },
	{ value: 'dark', label: 'Dark', icon: 'mdi-weather-night' },
	{ value: 'system', label: 'Auto', icon: 'mdi-monitor' },
]
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

function jumpToSection(id) {
	const heading = document.getElementById(id)
	heading.focus({ preventScroll: true })
	heading.scrollIntoView({ block: 'start' })
}

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
</script>

<style scoped>
.settings-page {
	display: grid;
	grid-template:
		"sidebar header" auto
		"sidebar main" minmax(0, 1fr)
		/ 15rem minmax(0, 1fr);
	height: 100%;
	background: var(--casa-surface);
	color: var(--casa-text);
}

.settings-header {
	grid-area: header;
	padding: 1rem 1.5rem;
	border-bottom: 1px solid var(--casa-divider-soft);
}

.settings-header .breadcrumb a {
	color: var(--casa-text-hint);
	border-radius: 4px;
}

.settings-header .breadcrumb a:hover {
	background: var(--casa-primary-tint);
	color: var(--bulma-link);
}

.settings-header h1 {
	margin-inline-start: 0.75rem;
}

.settings-nav {
	grid-area: sidebar;
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
	overflow-y: auto;
	padding: 1rem 0.75rem;
	background: var(--casa-surface-sunken);
}

.settings-nav-link {
	display: flex;
	flex: none;
	align-items: center;
	gap: 0.5rem;
	padding: 0.625rem 0.75rem;
	border: 0;
	border-radius: 4px;
	background: transparent;
	color: inherit;
	font: inherit;
	font-size: 0.875rem;
	text-align: start;
	cursor: pointer;
}

.settings-nav-link:hover {
	background: var(--casa-hover-sunken);
}

.settings-main {
	grid-area: main;
	overflow-y: auto;
	padding: 1.5rem;
}

.settings-content {
	max-width: 52rem;
	font-size: 0.875rem;
	overflow-wrap: anywhere;
}

.settings-section + .settings-section {
	margin-block-start: 1.5rem;
	padding-block-start: 1.5rem;
	border-top: 1px solid var(--casa-divider-soft);
}

.settings-section > .title {
	scroll-margin-block-start: 1.5rem;
}

.settings-description {
	color: var(--casa-text-hint);
}

.settings-row,
.account-summary {
	display: flex;
	align-items: center;
	gap: 0.75rem;
}

.settings-row {
	justify-content: space-between;
}

.preference-row + .preference-row,
.user-row + .user-row {
	border-top: 1px solid var(--casa-divider-soft);
}

.preference-row,
.user-row {
	padding-block: 0.75rem;
}

.preference-row:first-child {
	flex-wrap: wrap;
	padding-block-start: 0;
}

.preference-row:last-child,
.user-row:last-child {
	padding-block-end: 0;
}

.preference-row :deep(.switch) {
	flex: none;
	margin: 0;
}

.theme-options {
	display: flex;
	flex-wrap: wrap;
	gap: 0.25rem;
}

.theme-options input:checked + .button {
	background-color: var(--casa-selected);
	color: var(--casa-text-emphasis);
}

.theme-options input:focus-visible + .button {
	outline: 2px solid var(--bulma-link);
	outline-offset: 2px;
}

.account-summary {
	flex-wrap: wrap;
	margin-block-end: 1rem;
}

.factor-heading {
	margin-block-end: 1rem;
}

.settings-columns {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr));
	gap: 1.25rem 2rem;
	align-items: start;
}

.settings-group {
	min-width: 0;
}

.settings-group :deep(.button) {
	height: auto;
	min-height: 2.5em;
	white-space: normal;
}

@media (max-width: 48rem) {
	.settings-page {
		grid-template:
			"header" auto
			"sidebar" auto
			"main" minmax(0, 1fr)
			/ minmax(0, 1fr);
	}

	.settings-header,
	.settings-main {
		padding: 1rem;
	}

	.settings-nav {
		flex-direction: row;
		flex-wrap: wrap;
		padding: 0.25rem 0.5rem;
	}

	.settings-nav-link {
		padding: 0.5rem;
	}
}
</style>
