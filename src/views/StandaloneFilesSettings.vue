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
					<button class="settings-nav-link" type="button" @click="jumpToSection('security-title')">
						<span class="mdi mdi-lock-outline" aria-hidden="true" />
						Security
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
					<section class="settings-section" aria-labelledby="security-title">
						<h2 id="security-title" class="section-title" tabindex="-1">Security</h2>
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
				</div>
			</div>
		</div>
	</main>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useStore } from 'vuex'
import TwoFactorPanel from '@/components/account/TwoFactorPanel.vue'
import { readThemePreference, setThemePreference } from '@/mixins/app/themePreference'
import { filesAccountRequest } from '@/service/filesAccounts'

const store = useStore()
const user = computed(() => store.state.user)
const theme = ref(readThemePreference(undefined, 'light'))
const themeOptions = [
	{ value: 'light', label: 'Light', icon: 'mdi-white-balance-sunny' },
	{ value: 'dark', label: 'Dark', icon: 'mdi-weather-night' },
	{ value: 'system', label: 'Auto', icon: 'mdi-monitor' },
]
const currentPassword = ref('')
const newPassword = ref('')
const twoFactorOpen = ref(false)
const busy = ref(false)
const error = ref('')
const notice = ref('')

function jumpToSection(id) {
	const heading = document.getElementById(id)
	heading.focus({ preventScroll: true })
	heading.scrollIntoView({ block: 'start' })
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

function factorChanged(value) {
	store.commit('SET_TOTP_ENABLED', value)
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
.settings-panel .button {
	border-radius: 0.5rem;
}

.settings-panel :deep(.input) {
	background-color: var(--casa-surface-soft);
	color: var(--casa-text);
}

.settings-row,
.preference-label,
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
.preference-description {
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
