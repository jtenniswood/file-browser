<template>
	<dialog ref="dialog" class="settings-dialog" aria-labelledby="settings-title" @cancel.prevent="emit('close')" @keydown.esc.stop>
		<div class="settings-page">
			<header class="settings-header">
				<h1 id="settings-title" class="title is-header mb-0">{{ $t('Settings') }}</h1>
				<button class="delete" type="button" :aria-label="$t('Close')" autofocus @click="emit('close')"></button>
			</header>

			<nav class="settings-nav scrollbars-light" aria-label="Settings sections">
				<button class="settings-nav-link" type="button"
					:aria-current="activeSection === 'preferences-title' ? 'location' : undefined" @click="jumpToSection('preferences-title')">
					<b-icon icon="tune-variant" aria-hidden="true" />
					Preferences
				</button>
				<button class="settings-nav-link" type="button"
					:aria-current="activeSection === 'account-title' ? 'location' : undefined" @click="jumpToSection('account-title')">
					<b-icon icon="account-outline" aria-hidden="true" />
					Your account
				</button>
				<button v-if="isAdmin" class="settings-nav-link" type="button"
					:aria-current="activeSection === 'users-title' ? 'location' : undefined" @click="jumpToSection('users-title')">
					<b-icon icon="account-multiple-outline" aria-hidden="true" />
					Users
				</button>
			</nav>

			<div class="settings-main scrollbars-light" @focusin="selectFocusedSection">
				<div class="settings-content">
					<p v-if="error" class="notification is-danger is-light" role="alert">{{ error }}</p>
					<p v-if="notice" class="notification is-success is-light" role="status">{{ notice }}</p>
					<section class="settings-section" aria-labelledby="preferences-title">
						<h2 id="preferences-title" class="title is-3 mb-3" tabindex="-1">Preferences</h2>
						<div class="settings-panel settings-pane">
							<div class="settings-row preference-row">
								<div>
									<h3 id="appearance-title" class="setting_title">{{ $t('Appearance') }}</h3>
									<p class="help settings-description">Choose how Files looks on this device.</p>
								</div>
								<div class="theme-options" role="radiogroup" aria-labelledby="appearance-title">
									<label v-for="option in themeOptions" :key="option.value">
										<input v-model="theme" class="is-sr-only" type="radio" name="files-theme" :value="option.value"
											@change="setThemePreference(option.value)">
										<span class="theme-choice">
											<span class="theme-preview" :class="'theme-preview-' + option.value" aria-hidden="true"></span>
											<span class="theme-label">
												<span class="mdi" :class="option.icon" aria-hidden="true"></span>
												{{ $t(option.label) }}
											</span>
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
						<h2 id="account-title" class="title is-3 mb-3" tabindex="-1">Your account</h2>
						<div class="settings-panel">
							<div class="settings-pane account-summary">
								<span class="account-icon"><b-icon icon="account-outline" aria-hidden="true" /></span>
								<strong>{{ user.username }}</strong>
								<span class="tag is-rounded">{{ roleLabel(user.role) }}</span>
							</div>
							<div class="settings-columns">
								<form class="settings-pane" @submit.prevent="changePassword">
									<h3 class="setting_title mb-3">Change password</h3>
									<input type="hidden" autocomplete="username" :value="user.username">
									<label class="label" for="files-current-password">Current password</label>
									<input id="files-current-password" v-model="currentPassword" class="input mb-3" type="password" autocomplete="current-password" required>
									<label class="label" for="files-new-password">New password</label>
									<input id="files-new-password" v-model="newPassword" class="input" type="password" autocomplete="new-password" minlength="12" required>
									<p class="help settings-description mb-4">Use at least 12 characters.</p>
									<button class="button is-primary" :disabled="busy" type="submit">Change password</button>
								</form>
								<div class="settings-pane">
									<div class="settings-row factor-heading">
										<h3 class="setting_title">Two-factor sign-in</h3>
										<span class="tag is-rounded" :class="{ 'is-success is-light': user.totp_enabled }">{{ user.totp_enabled ? 'On' : 'Off' }}</span>
									</div>
									<TwoFactorPanel v-if="twoFactorOpen" @change="factorChanged" @done="twoFactorOpen = false" />
									<button v-if="!twoFactorOpen" class="button" type="button" @click="twoFactorOpen = true">
										{{ user.totp_enabled ? 'Manage two-factor sign-in' : 'Set up an authenticator app' }}
									</button>
									<button v-else class="button is-ghost mt-2" type="button" @click="twoFactorOpen = false">Close two-factor settings</button>
								</div>
							</div>
						</div>
					</section>
					<section v-if="isAdmin" class="settings-section" aria-labelledby="users-title">
						<h2 id="users-title" class="title is-3 mb-3" tabindex="-1">Users</h2>
						<p class="help settings-description mb-4">All users can read and change files in the shared folder. Administrators can also manage accounts.</p>
						<div class="settings-panel settings-columns">
							<div class="settings-pane">
								<h3 class="setting_title mb-3">User accounts</h3>
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
							<form v-if="!selected" class="settings-pane" @submit.prevent="addUser">
								<h3 class="setting_title mb-3">Add a user</h3>
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
							<div v-else class="settings-pane">
								<h3 class="setting_title mb-3">Manage {{ selected.username }}</h3>
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
	</dialog>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useStore } from 'vuex'
import TwoFactorPanel from '@/components/account/TwoFactorPanel.vue'
import { readThemePreference, setThemePreference } from '@/mixins/app/themePreference'
import { filesAccountRequest } from '@/service/filesAccounts'

const emit = defineEmits(['close'])
const dialog = ref(null)
const store = useStore()
const user = computed(() => store.state.user)
const isAdmin = computed(() => user.value.role === 'admin')
const activeSection = ref('preferences-title')
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
	dialog.value.showModal()
	if (isAdmin.value)
		loadUsers()
})
onBeforeUnmount(() => dialog.value.close())

function selectFocusedSection(event) {
	const section = event.target.closest('.settings-section')
	if (section)
		activeSection.value = section.getAttribute('aria-labelledby')
}

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
.settings-dialog {
	inset: 0;
	width: min(64rem, calc(100% - 2rem));
	height: min(46rem, calc(100dvh - 2rem));
	max-width: none;
	max-height: none;
	margin: auto;
	padding: 0;
	overflow: hidden;
	border: 1px solid var(--casa-border);
	border-radius: 1rem;
	background: var(--casa-surface);
	box-shadow: 0 1rem 3rem rgb(0 0 0 / 24%);
}

.settings-dialog::backdrop {
	background: rgb(0 0 0 / 55%);
}

.settings-page {
	--settings-inset: clamp(0.875rem, 2vw, 1.25rem);
	display: grid;
	grid-template:
		"header header" auto
		"sidebar main" minmax(0, 1fr)
		/ 11rem minmax(0, 1fr);
	height: 100%;
	background: var(--casa-surface-soft);
	color: var(--casa-text);
}

.settings-header {
	grid-area: header;
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 0.875rem 1.25rem;
	border-bottom: 1px solid var(--casa-divider);
	background: var(--casa-surface);
}

.settings-header .delete {
	min-width: 2rem;
	min-height: 2rem;
}

.settings-header .delete:focus-visible {
	outline: 2px solid var(--bulma-link);
	outline-offset: 2px;
}

.settings-nav {
	grid-area: sidebar;
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
	overflow-y: auto;
	padding: 1.25rem 0.75rem;
	border-inline-end: 1px solid var(--casa-divider);
	background: var(--casa-surface-sunken);
}

.settings-nav-link {
	display: flex;
	flex: none;
	align-items: center;
	gap: 0.5rem;
	padding: 0.625rem 0.75rem;
	border: 0;
	border-radius: 0.5rem;
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

.settings-nav-link[aria-current] {
	background: var(--casa-selected);
	color: var(--casa-text-emphasis);
	font-weight: 600;
}

.settings-nav-link:focus-visible {
	outline: 2px solid var(--bulma-link);
	outline-offset: -2px;
}

.settings-main {
	grid-area: main;
	overflow-y: auto;
	padding: clamp(1.25rem, 3vw, 2rem);
}

.settings-content {
	font-size: 0.875rem;
	overflow-wrap: anywhere;
}

.settings-section + .settings-section {
	margin-block-start: 2rem;
}

.settings-section > .title {
	scroll-margin-block-start: 1.25rem;
}

.settings-description {
	color: var(--casa-text-hint);
}

.settings-row,
.account-summary {
	display: flex;
	align-items: center;
	gap: 0.75rem 1rem;
}

.settings-row {
	justify-content: space-between;
}

.preference-row + .preference-row,
.user-row + .user-row {
	border-top: 1px solid var(--casa-divider);
}

.preference-row,
.user-row {
	padding-block: 0.875rem;
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
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 0.5rem;
	inline-size: min(100%, 18rem);
}

.theme-choice {
	display: grid;
	gap: 0.35rem;
	padding: 0.375rem;
	border: 1px solid var(--casa-border);
	border-radius: 0.5rem;
	background: var(--casa-surface);
	text-align: center;
	cursor: pointer;
}

.theme-choice:hover {
	border-color: var(--casa-border-strong);
}

.theme-options input:checked + .theme-choice {
	border-color: var(--bulma-link);
	background: var(--casa-selected);
}

.theme-options input:focus-visible + .theme-choice {
	outline: 2px solid var(--bulma-link);
	outline-offset: 2px;
}

.theme-preview {
	--preview-sidebar: #e2e8f0;
	--preview-surface: #f8fafc;
	--preview-line: #94a3b8;
	position: relative;
	display: block;
	block-size: 2.25rem;
	overflow: hidden;
	border: 1px solid var(--casa-border);
	border-radius: 0.3rem;
	background: linear-gradient(to right, var(--preview-sidebar) 28%, var(--preview-surface) 28%);
}

.theme-preview::after {
	position: absolute;
	inset: 0.55rem 16% auto 40%;
	block-size: 0.2rem;
	border-radius: 1rem;
	background: #2476f3;
	box-shadow: 0 0.46rem var(--preview-line), 0 0.92rem var(--preview-line);
	content: '';
}

.theme-preview-dark {
	--preview-sidebar: #17181a;
	--preview-surface: #2a2b2f;
	--preview-line: #717783;
}

.theme-preview-system {
	--preview-line: #818d9e;
	background: linear-gradient(to right, #e2e8f0 28%, #f8fafc 28% 50%, #2a2b2f 50%);
}

.theme-label {
	display: flex;
	justify-content: center;
	align-items: center;
	gap: 0.25rem;
	font-size: 0.8125rem;
	font-weight: 600;
}

.account-summary {
	flex-wrap: wrap;
	border-block-end: 1px solid var(--casa-divider);
}

.account-icon {
	display: grid;
	flex: none;
	place-items: center;
	inline-size: 2.5rem;
	block-size: 2.5rem;
	border-radius: 0.625rem;
	background: var(--casa-selected);
	color: var(--casa-text-emphasis);
}

.factor-heading {
	margin-block-end: 1rem;
}

.settings-columns {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr));
	gap: 1px;
	background: var(--casa-divider);
}

.settings-panel {
	overflow: clip;
	border: 1px solid var(--casa-border);
	border-radius: 0.75rem;
	box-shadow: 0 1px 2px rgb(0 0 0 / 5%);
}

.settings-pane {
	min-width: 0;
	padding: var(--settings-inset);
	background: var(--casa-surface);
}

.settings-panel :deep(.button) {
	height: auto;
	min-height: 2.5em;
	white-space: normal;
}

@media (max-width: 44rem) {
	.settings-dialog {
		width: calc(100% - 1rem);
		height: calc(100dvh - 1rem);
	}

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
		padding: 0.5rem;
		border-inline-end: 0;
		border-bottom: 1px solid var(--casa-divider);
	}

	.settings-nav-link {
		flex: 1 0 auto;
		justify-content: center;
		gap: 0.375rem;
		padding: 0.5rem 0.375rem;
		font-size: 0.8125rem;
	}
}
</style>
