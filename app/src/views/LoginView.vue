<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuthStore } from '@/auth/authStore'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const username = ref('')
const password = ref('')
const error = ref<string | null>(null)
const pending = ref(false)

async function onSubmit() {
  error.value = null
  pending.value = true
  try {
    await auth.login(username.value, password.value)
    // `redirect` comes from the router guard. Only relative paths are followed:
    // an absolute URL in a query parameter is an open-redirect vector.
    const redirect = route.query.redirect
    const target = typeof redirect === 'string' && redirect.startsWith('/') ? redirect : '/espace'
    await router.replace(target)
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Échec de la connexion.'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <section>
    <h1>Connexion</h1>

    <form class="form" @submit.prevent="onSubmit">
      <label for="username">Identifiant</label>
      <input id="username" v-model="username" autocomplete="username" required autofocus />

      <label for="password">Mot de passe</label>
      <input
        id="password"
        v-model="password"
        type="password"
        autocomplete="current-password"
        required
      />

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <button type="submit" :disabled="pending">
        {{ pending ? 'Connexion…' : 'Se connecter' }}
      </button>
    </form>

    <p class="note">
      Authentification OAuth2 sur <code>/o/token/</code> du backend, en flux
      <em>resource owner password</em>. En développement, le compte de test est
      <code>admin</code> / <code>admin</code>.
    </p>
  </section>
</template>
