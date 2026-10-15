<script setup lang="ts">
import Button from 'primevue/button'
import Card from 'primevue/card'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Password from 'primevue/password'
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuthStore } from '@/auth/authStore'
import { HOME_ROUTE } from '@/router/constants'

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
    const target = typeof redirect === 'string' && redirect.startsWith('/') ? redirect : HOME_ROUTE
    await router.replace(target)
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Échec de la connexion.'
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <Card class="login">
    <template #title>
      <div class="login__brand"><i class="pi pi-box" /> Totem Admin</div>
    </template>

    <template #content>
      <form class="login__form" @submit.prevent="onSubmit">
        <label for="username">Identifiant</label>
        <InputText id="username" v-model="username" autocomplete="username" required autofocus />

        <label for="password">Mot de passe</label>
        <Password
          input-id="password"
          v-model="password"
          :feedback="false"
          toggle-mask
          autocomplete="current-password"
          required
          fluid
        />

        <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>

        <Button
          type="submit"
          :loading="pending"
          :label="pending ? 'Connexion…' : 'Se connecter'"
          icon="pi pi-sign-in"
        />
      </form>
    </template>
  </Card>
</template>

<style scoped>
.login {
  width: min(26rem, 100%);
}

.login__brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.login__brand i {
  color: var(--p-primary-color);
}

.login__form {
  display: grid;
  gap: 0.4rem;
}

.login__form label {
  font-size: 0.9rem;
  color: var(--app-muted);
}

.login__form label:not(:first-child) {
  margin-top: 0.6rem;
}

.login__form button[type='submit'] {
  margin-top: 1rem;
}
</style>
