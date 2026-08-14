<script setup lang="ts">
import Button from 'primevue/button'
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import { useAuthStore } from '@/auth/authStore'
import { HOME_ROUTE } from '@/router/constants'

const route = useRoute()
const auth = useAuthStore()

const from = computed(() => (typeof route.query.from === 'string' ? route.query.from : null))
</script>

<template>
  <section class="centered">
    <h1>403</h1>
    <p>
      Vous êtes bien connecté<span v-if="auth.profile"> en tant que <code>{{ auth.profile.login }}</code></span
      >, mais votre compte n'a pas la permission requise
      <span v-if="from">pour <code>{{ from }}</code></span
      >.
    </p>
    <p class="note">
      Les permissions viennent des rôles attribués à l'utilisateur côté backend. Elles sont relues à
      chaque connexion&nbsp;: après l'ajout d'un rôle, il faut se reconnecter.
    </p>
    <RouterLink :to="HOME_ROUTE"><Button label="Retour au dashboard" icon="pi pi-home" /></RouterLink>
  </section>
</template>
