<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="shell">
    <header class="shell__header">
      <span class="shell__brand">Totem Admin</span>
      <nav class="shell__nav">
        <RouterLink to="/">Accueil</RouterLink>
        <RouterLink to="/diagnostic">Diagnostic</RouterLink>
      </nav>
    </header>

    <main class="shell__main">
      <RouterView />
    </main>
  </div>
</template>
