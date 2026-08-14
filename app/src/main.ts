import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import { router } from './router'
import './styles/main.css'

// Pinia must be installed before the router: the navigation guard calls
// useAuthStore(), and that runs on the very first navigation.
createApp(App).use(createPinia()).use(router).mount('#app')
