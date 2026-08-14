import { createRouter, createWebHistory } from 'vue-router'

import DiagnosticView from '@/views/DiagnosticView.vue'
import HomeView from '@/views/HomeView.vue'
import NotFoundView from '@/views/NotFoundView.vue'

// createWebHistory produces real URLs (/diagnostic), so the server must return
// index.html for any unknown path. That is the `try_files ... /index.html`
// fallback in docker/nginx/spa.conf.template -- without it a hard refresh on
// /diagnostic returns a 404.
export const router = createRouter({
  // import.meta.env.BASE_URL is Vite's `base`, so the router and the asset URLs
  // can never disagree about the prefix the app is mounted under.
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/diagnostic', name: 'diagnostic', component: DiagnosticView },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },
  ],
})
