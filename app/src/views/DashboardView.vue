<script setup lang="ts">
import Card from 'primevue/card'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import { computed } from 'vue'

import { useAuthStore } from '@/auth/authStore'

const auth = useAuthStore()

const scopes = computed(() => Array.from(auth.scopes).sort())
const expiresAt = computed(() =>
  auth.tokens ? new Date(auth.tokens.expiresAt).toLocaleString('fr-FR') : '—',
)
</script>

<template>
  <section class="page">
    <header class="page__header">
      <h1>Dashboard</h1>
    </header>

    <div class="cards">
      <Card>
        <template #title>Session</template>
        <template #content>
          <dl class="pairs">
            <dt>Identifiant</dt>
            <dd>{{ auth.profile?.login ?? '—' }}</dd>
            <dt>Courriel</dt>
            <dd>{{ auth.profile?.email ?? '—' }}</dd>
            <dt>Jeton valide jusqu'à</dt>
            <dd>{{ expiresAt }}</dd>
          </dl>
        </template>
      </Card>

      <Card>
        <template #title>Permissions</template>
        <template #content>
          <div v-if="scopes.length" class="tags">
            <Tag v-for="scope in scopes" :key="scope" :value="scope" severity="secondary" />
          </div>
          <Message v-else severity="warn" :closable="false">
            Aucune permission&nbsp;: cet utilisateur n'a pas de rôle attribué. Les entrées de menu
            protégées — dont <strong>Settings › Users</strong> — restent donc masquées.
          </Message>
        </template>
      </Card>
    </div>
  </section>
</template>
