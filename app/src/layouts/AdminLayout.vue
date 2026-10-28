<script setup lang="ts">
import Button from 'primevue/button'
import ConfirmDialog from 'primevue/confirmdialog'
import Menu from 'primevue/menu'
import type { MenuItem as PrimeMenuItem } from 'primevue/menuitem'
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuthStore } from '@/auth/authStore'
import TotemMark from '@/components/TotemMark.vue'
import { useTheme } from '@/composables/useTheme'

import AppMenu from './AppMenu.vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const { theme, toggle } = useTheme()

// Collapsed on small screens; the CSS turns the sidebar into an overlay there.
const sidebarOpen = ref(true)

// The session can end under a mounted page: a refresh token refused by the
// backend, or a sign-out in another tab. The guard only runs on navigation, so
// without this the page would stay on screen, failing every request with a 401.
watch(
  () => auth.isAuthenticated,
  (signedIn) => {
    if (!signedIn) router.replace({ name: 'login', query: { redirect: route.fullPath } })
  },
)

const userMenu = ref<InstanceType<typeof Menu> | null>(null)
const userMenuItems: PrimeMenuItem[] = [
  {
    label: 'Se déconnecter',
    icon: 'pi pi-sign-out',
    // The watcher above does the navigation, as for any other end of session.
    command: () => auth.logout(),
  },
  {
    label: 'My Profile',
    icon: 'pi pi-user',
    command: () => router.push({ name: 'profile' }),
  },
]
</script>

<template>
  <div class="layout" :class="{ 'layout--collapsed': !sidebarOpen }">
    <header class="topbar">
      <Button
        text
        rounded
        aria-label="Basculer le menu"
        icon="pi pi-bars"
        @click="sidebarOpen = !sidebarOpen"
      />
      <RouterLink to="/dashboard" class="topbar__brand">
        <TotemMark />
        <span>totem</span>
      </RouterLink>

      <div class="topbar__actions">
        <Button
          text
          rounded
          :aria-label="theme === 'dark' ? 'Thème clair' : 'Thème sombre'"
          :icon="theme === 'dark' ? 'pi pi-sun' : 'pi pi-moon'"
          @click="toggle"
        />
        <Button
          text
          rounded
          icon="pi pi-user"
          :aria-label="auth.profile?.login ?? 'Compte'"
          @click="userMenu?.toggle($event)"
        />
        <Menu ref="userMenu" :model="userMenuItems" :popup="true" />
      </div>
    </header>

    <aside class="sidebar">
      <AppMenu />
    </aside>

    <!-- Closes the overlay sidebar on small screens. Inert on desktop. -->
    <div class="layout__mask" @click="sidebarOpen = false" />

    <main class="content">
      <RouterView />
    </main>

    <!-- Mounted once for every authenticated screen: useConfirm() only queues a
         request, and it needs exactly one dialog to render it. -->
    <ConfirmDialog />
  </div>
</template>
