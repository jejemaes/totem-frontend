<script setup lang="ts">
import { RouterLink, RouterView, useRouter } from 'vue-router'

import { useAuthStore } from '@/auth/authStore'

const auth = useAuthStore()
const router = useRouter()

async function onLogout() {
  await auth.logout()
  await router.push({ name: 'public' })
}
</script>

<template>
  <div class="shell">
    <header class="shell__header">
      <span class="shell__brand">Totem Admin</span>

      <nav class="shell__nav">
        <RouterLink to="/">Public</RouterLink>
        <RouterLink to="/espace">Espace privé</RouterLink>
        <RouterLink to="/diagnostic">Diagnostic</RouterLink>
      </nav>

      <div class="shell__auth">
        <template v-if="auth.isAuthenticated">
          <span class="muted">{{ auth.profile?.login }}</span>
          <button type="button" class="link" @click="onLogout">Se déconnecter</button>
        </template>
        <RouterLink v-else to="/login">Se connecter</RouterLink>
      </div>
    </header>

    <main class="shell__main">
      <RouterView />
    </main>
  </div>
</template>
