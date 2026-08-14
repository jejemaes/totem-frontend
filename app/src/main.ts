import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import { initTheme } from './composables/useTheme'
import { installPrimeVue } from './plugins/primevue'
import { router } from './router'
import './styles/main.css'

// Before mount, so the page never paints in the wrong theme first.
initTheme()

const app = createApp(App)

installPrimeVue(app)
// Pinia must be installed before the router: the navigation guard calls
// useAuthStore(), and that runs on the very first navigation.
app.use(createPinia())
app.use(router)

app.mount('#app')
