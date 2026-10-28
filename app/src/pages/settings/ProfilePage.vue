<script setup lang="ts">
/*
 * /profile: the page chrome around ProfileView, reached from the user menu.
 *
 * Its one job beyond the header: hand the saved profile to the auth store. The
 * topbar labels the user menu with `auth.profile.login`, and the store fetched
 * that ONCE, at sign-in -- without this a renamed login would keep showing the
 * old one until the next session.
 */
import { ref } from 'vue'

import { useAuthStore } from '@/auth/authStore'
import type { UserProfile } from '@/resources/profile'
import ProfileView from '@/views/settings/ProfileView.vue'

const auth = useAuthStore()
const title = ref('')

function onSaved(profile: UserProfile): void {
  auth.profile = profile
}
</script>

<template>
  <section class="page">
    <header class="page__header">
      <div>
        <h1>{{ title }}</h1>
        <p class="page__subtitle">Your own account. Roles are granted by an administrator.</p>
      </div>
    </header>

    <ProfileView @saved="onSaved" @title="title = $event" />
  </section>
</template>
