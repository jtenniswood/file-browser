<template>
	<dialog ref="dialog" class="modal-card settings-dialog" aria-labelledby="settings-title" @cancel.prevent="emit('close')" @keydown.esc.stop>
		<header class="modal-card-head is-justify-content-space-between">
			<h1 id="settings-title" class="title is-header mb-0">{{ $t('Settings') }}</h1>
			<button class="close-button" type="button" :aria-label="$t('Close')" autofocus @click="emit('close')">
				<b-icon icon="close-outline" pack="casa" aria-hidden="true" />
			</button>
		</header>

		<b-tabs v-model="tab" :animated="false" :vertical="verticalTabs" class="settings-tabs" size="is-small">
			<b-tab-item class="modal-card-body" :icon="verticalTabs ? 'settings-outline' : undefined" icon-pack="casa" label="Preferences" value="preferences">
				<div class="settings-row preference-row">
					<label class="setting_title" for="files-theme">{{ $t('Appearance') }}</label>
					<b-select id="files-theme" v-model="theme" :compat-fallthrough="false" @update:model-value="setThemePreference">
						<option v-for="option in themeOptions" :key="option.value" :value="option.value">{{ $t(option.label) }}</option>
					</b-select>
				</div>
				<div class="settings-row preference-row">
					<div>
						<h2 id="hidden-files-title" class="setting_title">{{ $t('Show hidden files') }}</h2>
						<p class="help settings-description">Include items whose names start with a dot.</p>
					</div>
					<b-switch aria-labelledby="hidden-files-title" :model-value="store.state.showHiddenFiles"
						@update:model-value="store.commit('SET_SHOW_HIDDEN_FILES', $event)" />
				</div>
			</b-tab-item>
			<b-tab-item class="modal-card-body" :icon="verticalTabs ? 'account-outline' : undefined" icon-pack="casa" label="Your account" value="account">
				<div class="account-summary">
					<strong>{{ user.username }}</strong>
					<span class="tag is-rounded">{{ roleLabel(user.role) }}</span>
				</div>
				<div class="settings-columns">
					<form @submit.prevent="changePassword">
						<h2 class="setting_title mb-3">Change password</h2>
						<input type="hidden" autocomplete="username" :value="user.username">
						<label class="label" for="files-current-password">Current password</label>
						<input id="files-current-password" v-model="currentPassword" class="input mb-3" type="password" autocomplete="current-password" required>
						<label class="label" for="files-new-password">New password</label>
						<input id="files-new-password" v-model="newPassword" class="input" type="password" autocomplete="new-password" minlength="12" required>
						<p class="help settings-description mb-4">Use at least 12 characters.</p>
						<button class="button is-primary" :disabled="busy" type="submit">Change password</button>
					</form>
					<div>
						<div class="settings-row factor-heading">
							<h2 class="setting_title">Two-factor sign-in</h2>
							<span class="tag is-rounded" :class="{ 'is-success is-light': user.totp_enabled }">{{ user.totp_enabled ? 'On' : 'Off' }}</span>
						</div>
						<TwoFactorPanel v-if="twoFactorOpen" @change="factorChanged" @done="twoFactorOpen = false" />
						<button v-if="!twoFactorOpen" class="button" type="button" @click="twoFactorOpen = true">
							{{ user.totp_enabled ? 'Manage two-factor sign-in' : 'Set up an authenticator app' }}
						</button>
						<button v-else class="button is-ghost mt-2" type="button" @click="twoFactorOpen = false">Close two-factor settings</button>
					</div>
				</div>
			</b-tab-item>
			<b-tab-item v-if="isAdmin" class="modal-card-body" :icon="verticalTabs ? 'account-multiple-outline' : undefined" label="Users" value="users">
				<p class="help settings-description mb-4">All users can read and change files in the shared folder. Administrators can also manage accounts.</p>
				<div class="settings-columns">
					<div>
						<h2 class="setting_title mb-3">User accounts</h2>
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
					<form v-if="!selected" @submit.prevent="addUser">
						<h2 class="setting_title mb-3">Add a user</h2>
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
					<div v-else>
						<h2 class="setting_title mb-3">Manage {{ selected.username }}</h2>
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
			</b-tab-item>
		</b-tabs>

		<p v-if="error" class="settings-feedback notification is-danger is-light" role="alert">{{ error }}</p>
		<p v-if="notice" class="settings-feedback notification is-success is-light" role="status">{{ notice }}</p>
	</dialog>
</template>

<script setup>
import { useMediaQuery } from '@vueuse/core'
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
const tab = ref('preferences')
const verticalTabs = useMediaQuery('(min-width: 40rem)')
const theme = ref(readThemePreference(undefined, 'light'))
const themeOptions = [
	{ value: 'light', label: 'Light' },
	{ value: 'dark', label: 'Dark' },
	{ value: 'system', label: 'Auto' },
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
	--settings-inset: clamp(1rem, 3vw, 1.5rem);
	position: fixed;
	inset: 0;
	width: min(49rem, calc(100% - 2rem));
	max-width: none;
	max-height: calc(100dvh - 2rem);
	margin: auto;
	padding: 0;
	overflow: hidden;
	border: 1px solid var(--casa-border);
	color: var(--casa-text);
}

.settings-dialog:not([open]) {
	display: none;
}

.settings-dialog .modal-card-head {
	box-shadow: none;
}

.settings-dialog .close-button {
	border: 0;
	background: transparent;
	color: inherit;
}

.settings-dialog .close-button:hover {
	background-color: var(--casa-hover-tint);
}

.settings-dialog .close-button:focus-visible,
.settings-tabs :deep(.tabs a:focus-visible) {
	outline: 2px solid var(--bulma-link);
	outline-offset: 2px;
}

.settings-tabs {
	display: flex;
	flex-direction: column;
	min-height: 0;
	font-size: 0.875rem;
	overflow-wrap: anywhere;
}

.settings-tabs :deep(.tabs) {
	flex: none;
	margin: 0;
}

.settings-tabs :deep(.tabs ul) {
	padding-inline: var(--settings-inset);
}

.settings-tabs.is-vertical {
	flex-direction: row;
	flex-wrap: nowrap;
}

.settings-tabs.is-vertical :deep(.tabs) {
	width: 10rem;
	overflow-y: auto;
	border-inline-end: 1px solid var(--casa-divider);
	background: var(--casa-surface-sunken);
}

.settings-tabs.is-vertical :deep(.tabs ul) {
	gap: 0.25rem;
	padding: 0.75rem;
	border-bottom: 0;
}

.settings-tabs.is-vertical :deep(.tabs a) {
	margin: 0;
	padding: 0.625rem 0.75rem;
	border-bottom: 0 !important;
	border-radius: 4px;
	font-size: 0.875rem;
}

.settings-tabs.is-vertical :deep(.tabs a:hover) {
	background: var(--casa-hover-sunken);
}

.settings-tabs.is-vertical :deep(.tabs .is-active a) {
	background: var(--casa-selected);
	font-weight: 600;
}

.settings-tabs :deep(.tab-content) {
	display: flex;
	min-width: 0;
	min-height: 0;
	padding: 0;
}

.settings-tabs :deep(.tab-content > .tab-item) {
	flex-shrink: 1;
	width: 100%;
	min-height: 0;
	overflow-y: auto;
	padding: var(--settings-inset);
}

.settings-tabs :deep(.tab-item:focus-visible) {
	outline: 2px solid var(--bulma-link);
	outline-offset: -2px;
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
	margin-block-start: 0.875rem;
	padding-block-start: 0.875rem;
	border-top: 1px solid var(--casa-divider);
}

.preference-row:first-child {
	flex-wrap: wrap;
}

.preference-row :deep(.switch) {
	flex: none;
	margin: 0;
}

.account-summary {
	flex-wrap: wrap;
	margin-block-end: 1rem;
	padding-block-end: 1rem;
	border-bottom: 1px solid var(--casa-divider);
}

.factor-heading {
	margin-block-end: 0.75rem;
}

.settings-columns {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));
	gap: 1.5rem;
	align-items: start;
}

.settings-columns :deep(.button) {
	height: auto;
	min-height: 2.5em;
	white-space: normal;
}

.settings-feedback.notification {
	margin: 0 var(--settings-inset) var(--settings-inset);
	padding: 0.75rem 1rem;
}

@media (max-width: 36rem) {
	.settings-dialog {
		width: calc(100% - 1rem);
	}
}
</style>
