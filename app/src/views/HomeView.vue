<script setup lang="ts">
const title = import.meta.env.VITE_APP_TITLE ?? 'Totem Admin'
</script>

<template>
  <section>
    <h1>{{ title }}</h1>
    <p>
      Squelette Vue 3 + TypeScript. Aucune intégration backend à ce stade&nbsp;: cette étape sert à
      valider la chaîne complète <em>image Docker → nginx → totem-proxy → navigateur</em>.
    </p>

    <p>
      Ouvrez <RouterLink to="/diagnostic">Diagnostic</RouterLink>, puis rechargez la page avec F5 :
      si elle s'affiche toujours (et ne renvoie pas un 404), le repli SPA de nginx fonctionne.
    </p>

    <p class="note">
      Prochaine étape&nbsp;: brancher l'API (<code>/api/v1/</code>) et l'authentification OAuth2
      (<code>/o/token/</code>) de <code>totem-backend</code>.
    </p>
  </section>
</template>
