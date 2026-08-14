<script setup lang="ts">
import { useAuthStore } from '@/auth/authStore'

const auth = useAuthStore()
</script>

<template>
  <section>
    <h1>Page publique</h1>

    <p>
      Cette page est accessible sans être connecté&nbsp;: sa route porte
      <code>meta.auth: 'none'</code>, et la garde du routeur la laisse passer sans vérifier de
      session.
    </p>

    <p v-if="auth.isAuthenticated">
      Vous êtes connecté. <RouterLink to="/espace">Accéder à l'espace privé</RouterLink>.
    </p>
    <p v-else>
      Vous n'êtes pas connecté. Ouvrir <RouterLink to="/espace">l'espace privé</RouterLink> vous
      redirigera vers la page de connexion, puis vous y ramènera une fois authentifié.
    </p>
  </section>
</template>
