<template>
	<main class="files-account-page settings-page">
		<div class="files-settings">
			<header class="settings-header">
				<RouterLink class="settings-back" :to="{ name: 'files', query: $route.query }">
					<span class="mdi mdi-arrow-left" aria-hidden="true" />
					Back to files
				</RouterLink>
				<h1 class="title">Settings</h1>
			</header>
			<div class="settings-layout">
				<nav class="settings-nav" aria-label="Settings sections">
					<button class="settings-nav-link" type="button" @click="jumpToSection('preferences-title')">
						<span class="mdi mdi-tune-variant" aria-hidden="true" />
						Preferences
					</button>
					<button class="settings-nav-link" type="button" @click="jumpToSection('account-title')">
						<span class="mdi mdi-account-outline" aria-hidden="true" />
						Your account
					</button>
					<button v-if="isAdmin" class="settings-nav-link" type="button" @click="jumpToSection('users-title')">
						<span class="mdi mdi-account-multiple-outline" aria-hidden="true" />
						Users
					</button>
				</nav>
				<div class="settings-content">
					<p v-if="error" class="notification is-danger is-light" role="alert">{{ error }}</p>
					<p v-if="notice" class="notification is-success is-light" role="status">{{ notice }}</p>
					<section class="settings-section" aria-labelledby="preferences-title">
						<h2 id="preferences-title" class="section-title" tabindex="-1">Preferences</h2>
						<div class="settings-panel">
							<div class="settings-row preference-row">
								<div class="preference-label">
									<span class="settings-icon mdi mdi-palette-outline" aria-hidden="true" />
									<div>
										<h3 id="appearance-title">{{ $t('Appearance') }}</h3>
										<p>Choose how Files looks on this device.</p>
									</div>
								</div>
								<div class="theme-options" role="radiogroup" aria-labelledby="appearance-title">
									<label v-for="option in themeOptions" :key="option.value" class="theme-option">
										<input v-model="theme" type="radio" name="files-theme" :value="option.value" @change="setThemePreference(option.value)">
										<span>
											<i class="mdi" :class="option.icon" aria-hidden="true" />
											{{ $t(option.label) }}
										</span>
									</label>
								</div>
							</div>
							<div class="settings-row preference-row">
								<div class="preference-label">
									<span class="settings-icon mdi mdi-folder-outline" aria-hidden="true" />
									<span>
										<strong id="hidden-files-title">{{ $t('Show hidden files') }}</strong>
										<span class="preference-description">Include items whose names start with a dot.</span>
									</span>
								</div>
								<b-switch aria-labelledby="hidden-files-title" :model-value="store.state.showHiddenFiles"
									@update:model-value="store.commit('SET_SHOW_HIDDEN_FILES', $event)" />
							</div>
						</div>
					</section>
					<section class="settings-section" aria-labelledby="account-title">
						<h2 id="account-title" class="section-title" tabindex="-1">Your account</h2>
						<div class="account-summary">
							<span class="settings-icon mdi mdi-account-outline" aria-hidden="true" />
							<strong>{{ user.username }}</strong>
							<span class="settings-pill">{{ roleLabel(user.role) }}</span>
						</div>
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
								<div class="settings-row factor-heading">
									<h3 class="title is-6 mb-0">Two-factor sign-in</h3>
									<span class="settings-pill" :class="{ 'is-enabled': user.totp_enabled }">{{ user.totp_enabled ? 'On' : 'Off' }}</span>
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
						<h2 id="users-title" class="section-title" tabindex="-1">Users</h2>
						<p class="section-description">All users can read and change files in the shared folder. Administrators can also manage accounts.</p>
						<div class="settings-columns">
							<div class="settings-panel">
								<h3 class="title is-6 mb-2">User accounts</h3>
								<p v-if="loadingUsers" role="status">Loading users…</p>
								<button v-if="!loadingUsers && !users.length" class="button" type="button" @click="loadUsers">Reload users</button>
								<ul>
									<li v-for="account in users" :key="account.username" class="settings-row user-row">
										<div>
											<strong>{{ account.username }}{{ account.username === user.username ? ' (you)' : '' }}</strong>
											<p class="user-details">{{ roleLabel(account.role) }} · Two-factor {{ account.totp_enabled ? 'on' : 'off' }}</p>
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
			</div>
		</div>
	</main>
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
	background: var(--casa-surface-soft);
}

.files-settings {
	max-width: 68rem;
	margin-inline: auto;
}

.settings-header {
	padding-block: 0.25rem 1.75rem;
}

.settings-header .title {
	margin-top: 0.75rem;
	font-size: clamp(2.125rem, 5vw, 2.875rem);
	letter-spacing: -0.045em;
}

.settings-back,
.settings-nav-link {
	display: inline-flex;
	align-items: center;
	gap: 0.625rem;
	color: var(--casa-text-secondary);
	font-size: 0.875rem;
	font-weight: 600;
}

.settings-back .mdi,
.settings-nav-link .mdi,
.theme-option .mdi {
	font-size: 1.125rem;
	line-height: 1;
}

.settings-back:hover,
.settings-nav-link:hover {
	color: var(--casa-text);
}

.settings-layout {
	display: grid;
	grid-template-columns: 11rem minmax(0, 1fr);
	gap: clamp(1rem, 4vw, 2.5rem);
	align-items: start;
}

.settings-nav {
	position: sticky;
	top: 0;
	display: grid;
	gap: 0.25rem;
}

.settings-nav-link {
	min-height: 2.5rem;
	padding-inline: 0.75rem;
	border: 0;
	border-radius: 0.5rem;
	background: transparent;
	text-align: start;
	cursor: pointer;
}

.settings-nav-link:hover {
	background: var(--casa-primary-tint);
}

.settings-content {
	display: grid;
	gap: 2rem;
}

.settings-content .notification {
	margin: 0;
}

.settings-section {
	min-width: 0;
}

.section-title {
	margin-block-end: 0.75rem;
	color: var(--casa-text-emphasis);
	font-size: 1.25rem;
	font-weight: 700;
	letter-spacing: -0.02em;
	scroll-margin-top: 1.25rem;
}

.section-description {
	margin: -0.375rem 0 0.875rem;
	color: var(--casa-text-hint);
	font-size: 0.875rem;
}

.settings-panel {
	min-width: 0;
	padding: clamp(0.875rem, 2.5vw, 1.25rem);
	border: 1px solid var(--bulma-border);
	border-radius: 0.875rem;
	background: var(--casa-surface);
	overflow-wrap: anywhere;
}

.settings-panel .title {
	line-height: 1.35;
}

.settings-panel .label {
	font-size: 0.875rem;
}

.settings-panel :deep(.button) {
	height: auto;
	min-height: 2.5em;
	white-space: normal;
}

.settings-panel .input,
.settings-panel .button,
.settings-panel .select select {
	border-radius: 0.5rem;
}

.settings-panel :deep(.input),
.settings-panel .select select {
	background-color: var(--casa-surface-soft);
	color: var(--casa-text);
}

.settings-row,
.preference-label,
.account-summary {
	display: flex;
	align-items: center;
	gap: 0.75rem;
}

.settings-row {
	justify-content: space-between;
}

.preference-row + .preference-row {
	margin-top: 1rem;
	padding-top: 1rem;
	border-top: 1px solid var(--bulma-border);
}

.preference-label h3,
.preference-label strong {
	color: var(--casa-text-emphasis);
	font-weight: 600;
}

.preference-label p,
.preference-description,
.user-details {
	display: block;
	color: var(--casa-text-hint);
	font-size: 0.8125rem;
}

.settings-icon {
	display: grid;
	flex: 0 0 2.375rem;
	place-items: center;
	height: 2.375rem;
	border-radius: 0.625rem;
	background: var(--casa-primary-tint);
	color: var(--casa-text);
	font-size: 1.25rem;
}

.theme-options {
	display: inline-flex;
	padding: 0.1875rem;
	border: 1px solid var(--bulma-border);
	border-radius: 0.625rem;
	background: var(--casa-surface-sunken);
}

.theme-option {
	position: relative;
	cursor: pointer;
}

.theme-option input {
	position: absolute;
	width: 1px;
	height: 1px;
	opacity: 0;
}

.theme-option span {
	display: flex;
	min-height: 2.125rem;
	align-items: center;
	justify-content: center;
	gap: 0.375rem;
	padding-inline: 0.625rem;
	border: 1px solid transparent;
	border-radius: 0.4375rem;
	color: var(--casa-text-hint);
	font-size: 0.8125rem;
	font-weight: 600;
}

.theme-option input:checked + span {
	border-color: var(--bulma-border);
	background: var(--casa-surface);
	color: var(--casa-text-emphasis);
	box-shadow: 0 1px 2px rgb(0 0 0 / 8%);
}

.theme-option input:focus-visible + span {
	outline: 2px solid var(--bulma-link);
	outline-offset: -2px;
}

.preference-row :deep(.switch) {
	flex: none;
	margin: 0;
}

.account-summary {
	flex-wrap: wrap;
	margin-block-end: 0.75rem;
	overflow-wrap: anywhere;
}

.account-summary strong {
	min-width: 0;
}

.settings-pill {
	display: inline-flex;
	align-items: center;
	padding: 0.1875rem 0.625rem;
	border-radius: 1rem;
	background: var(--casa-surface-sunken);
	color: var(--casa-text-hint);
	font-size: 0.75rem;
	font-weight: 600;
}

.settings-pill.is-enabled {
	background: var(--casa-primary-tint);
	color: var(--casa-text-emphasis);
}

.factor-heading {
	margin-block-end: 1rem;
}

.settings-columns {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 0.75rem;
	align-items: start;
}

.user-row {
	padding-block: 0.75rem;
}

.user-row + .user-row {
	border-top: 1px solid var(--bulma-border);
}

.user-row:last-child {
	padding-block-end: 0;
}

@media (max-width: 53rem) {
	.settings-layout {
		grid-template-columns: minmax(0, 1fr);
		gap: 1.5rem;
	}

	.settings-header {
		padding-bottom: 0.875rem;
	}

	.settings-nav {
		position: static;
		display: flex;
		flex-wrap: wrap;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--bulma-border);
	}

	.settings-nav-link {
		gap: 0.375rem;
		padding-inline: 0.5rem;
	}
}

@media (max-width: 38rem) {
	.settings-columns {
		grid-template-columns: minmax(0, 1fr);
	}

	.preference-row:first-child {
		flex-wrap: wrap;
	}

	.theme-options {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		width: 100%;
	}
}
</style>
