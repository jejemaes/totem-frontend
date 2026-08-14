<script setup lang="ts">
import { computed } from 'vue'

// Everything here is read from the browser, on purpose: the point of this page
// is to show WHICH domain served the app, so that routing a new tenant domain
// through totem-proxy can be confirmed at a glance.
const rows = computed(() => [
  { label: 'Domaine (Host)', value: window.location.host },
  { label: 'Protocole', value: window.location.protocol.replace(':', '') },
  { label: 'Chemin', value: window.location.pathname },
  // Vite's `base`, baked in at build time. Must match the prefix totem-proxy
  // serves this app under, otherwise every asset URL 404s.
  { label: 'Préfixe de montage', value: import.meta.env.BASE_URL },
  { label: 'Mode de build', value: import.meta.env.MODE },
  { label: 'Serveur de dev (HMR)', value: import.meta.env.DEV ? 'oui' : 'non — bundle statique' },
])
</script>

<template>
  <section>
    <h1>Diagnostic</h1>
    <p>
      Le <strong>domaine</strong> ci-dessous est celui que le navigateur a demandé. Si vous arrivez
      via <code>totem-proxy</code>, il doit correspondre à une ligne <code>domain.name</code>
      enregistrée en base (par exemple <code>totem.localhost:9999</code>), et non à
      <code>localhost:3006</code> qui est l'accès direct au conteneur.
    </p>

    <table>
      <tbody>
        <tr v-for="row in rows" :key="row.label">
          <th>{{ row.label }}</th>
          <td><code>{{ row.value }}</code></td>
        </tr>
      </tbody>
    </table>

    <p class="note">
      Les en-têtes <code>X-Tenant-Slug</code> / <code>X-Tenant-Name</code> injectés par le proxy ne
      sont pas lisibles ici&nbsp;: ils sont envoyés au serveur amont, pas au navigateur. Ils
      deviendront visibles quand le backend sera branché.
    </p>
  </section>
</template>
