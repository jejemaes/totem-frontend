<script setup lang="ts">
import Button from 'primevue/button'
import ConfirmDialog from 'primevue/confirmdialog'
import Menu from 'primevue/menu'
import type { MenuItem as PrimeMenuItem } from 'primevue/menuitem'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/auth/authStore'
import { useTheme } from '@/composables/useTheme'

import AppMenu from './AppMenu.vue'

const auth = useAuthStore()
const router = useRouter()
const { theme, toggle } = useTheme()

// Collapsed on small screens; the CSS turns the sidebar into an overlay there.
const sidebarOpen = ref(true)

const userMenu = ref<InstanceType<typeof Menu> | null>(null)
const userMenuItems: PrimeMenuItem[] = [
  {
    label: 'Se déconnecter',
    icon: 'pi pi-sign-out',
    command: async () => {
      await auth.logout()
      await router.push({ name: 'login' })
    },
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
        <i class="pi pi-box" />
        <span>TOTEM</span>
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
