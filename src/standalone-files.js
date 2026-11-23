import 'intersection-observer'
import { createApp, h } from 'vue'
import { RouterView } from 'vue-router'
import Buefy from 'buefy'
import VueFullscreen from 'vue-fullscreen'
import VueDOMPurifyHTML from 'vue-dompurify-html'
import router from './standalone-files-router'
import store from '@/store'
import i18n from '@/plugins/i18n'
import api from '@/service/api'
import createEventBus from '@/events/eventBus'
import casaIcons from '@/plugins/casa-icons'
import dropdownAppendToBody from '@/plugins/dropdown-append-to-body'
import { dompurifyOptions } from '@/plugins/dompurify'
import { applyThemePreference, readThemePreference } from '@/mixins/app/themePreference'
import '@/plugins/vee-validate'
import '@/assets/scss/app.scss'

applyThemePreference(readThemePreference(undefined, 'light'))

const app = createApp({ render: () => h(RouterView) })
app.use(Buefy, casaIcons)
app.use(dropdownAppendToBody)
app.use(VueFullscreen)
app.use(VueDOMPurifyHTML, dompurifyOptions)
app.use(store)
app.use(i18n)
app.use(router)

Object.assign(app.config.globalProperties, {
	$standaloneFiles: true,
	$api: api,
	$EventBus: createEventBus(),
	$baseIp: location.hostname,
	$baseURL: location.host,
	$protocol: location.protocol,
})
app.mount('#app')
