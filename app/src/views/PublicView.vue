<script setup lang="ts">
import Button from 'primevue/button'

import { useAuthStore } from '@/auth/authStore'
import { HOME_ROUTE } from '@/router/constants'

const auth = useAuthStore()
</script>

<template>
  <section class="centered">
    <h1>Totem</h1>

    <p>
      Page publique&nbsp;: sa route porte <code>meta.auth: 'none'</code>, donc la garde du routeur la
      laisse passer sans vérifier de session.
    </p>

    <RouterLink v-if="auth.isAuthenticated" :to="HOME_ROUTE">
      <Button label="Accéder au dashboard" icon="pi pi-arrow-right" />
    </RouterLink>
    <RouterLink v-else to="/login">
      <Button label="Se connecter" icon="pi pi-sign-in" />
    </RouterLink>
  </section>
</template>
