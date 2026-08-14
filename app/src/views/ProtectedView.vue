<script setup lang="ts">
import { computed } from 'vue'

import { useAuthStore } from '@/auth/authStore'

const auth = useAuthStore()

// The profile is loaded by the router guard (ensureSession) before this page is
// ever displayed, so there is no loading state to handle here.
const profile = computed(() => auth.profile)

const expiresAt = computed(() =>
  auth.tokens ? new Date(auth.tokens.expiresAt).toLocaleString('fr-FR') : '—',
)

const scopes = computed(() => Array.from(auth.scopes))
</script>

<template>
  <section>
    <h1>Espace privé</h1>

    <p>
      Route en <code>meta.auth: 'required'</code>. Les données ci-dessous viennent de
      <code>GET /api/v1/users/me/</code>, appelé avec le jeton porteur.
    </p>

    <table v-if="profile">
      <tbody>
        <tr>
          <th>Identifiant</th>
          <td><code>{{ profile.login }}</code></td>
        </tr>
        <tr>
          <th>Courriel</th>
          <td>{{ profile.email ?? '—' }}</td>
        </tr>
        <tr>
          <th>Nom</th>
          <td>{{ [profile.first_name, profile.last_name].filter(Boolean).join(' ') || '—' }}</td>
        </tr>
        <tr>
          <th>Langue</th>
          <td>{{ profile.language ?? '—' }}</td>
        </tr>
        <tr>
          <th>Jeton valide jusqu'à</th>
          <td>{{ expiresAt }}</td>
        </tr>
        <tr>
          <th>Permissions (scopes)</th>
          <td>
            <span v-if="scopes.length"><code v-for="s in scopes" :key="s">{{ s }}</code></span>
            <span v-else class="muted">aucune — l'utilisateur n'a pas de rôle attribué</span>
          </td>
        </tr>
      </tbody>
    </table>

    <p class="note">
      Pour vérifier la protection&nbsp;: déconnectez-vous, puis appelez directement
      <code>/espace</code> dans la barre d'adresse — vous serez renvoyé vers la connexion.
    </p>
  </section>
</template>
