<script setup lang="ts">
import Button from 'primevue/button'
</script>

<template>
  <section class="centered">
    <h1>404</h1>
    <p>
      Cette page n'existe pas côté application. Le fait que ce message soit rendu par Vue confirme
      que le serveur a bien renvoyé <code>index.html</code> plutôt qu'une erreur.
    </p>
    <RouterLink to="/"><Button label="Retour à l'accueil" icon="pi pi-home" /></RouterLink>
  </section>
</template>
