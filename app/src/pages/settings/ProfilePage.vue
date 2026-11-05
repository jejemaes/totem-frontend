<script setup lang="ts">
/*
 * /profile: the page chrome around ProfileView, reached from the user menu.
 *
 * Its one job beyond the header: hand the saved profile to the auth store. The
 * topbar labels the user menu with `auth.profile.login`, and the store fetched
 * that ONCE, at sign-in -- without this a renamed login would keep showing the
 * old one until the next session.
 *
 * It also frames the password change, in a Dialog of its own rather than as
 * fields of the profile form: that is another endpoint, with a body of its own,
 * and a password left in the profile's draft would ride along with every save.
 */
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import { ref } from 'vue'

import { useAuthStore } from '@/auth/authStore'
import type { UserProfile } from '@/resources/profile'
import ProfilePasswordView from '@/views/settings/ProfilePasswordView.vue'
import ProfileView from '@/views/settings/ProfileView.vue'

const auth = useAuthStore()
const title = ref('')

function onSaved(profile: UserProfile): void {
  auth.profile = profile
}

/*
 * The password Dialog, remounted per open through `passwordKey`: a cancelled
 * attempt must not leave its passwords in a draft for the next one to find.
 */
const passwordVisible = ref(false)
const passwordKey = ref(0)
const passwordTitle = ref('')
const passwordChanged = ref(false)

function openPassword(): void {
  passwordChanged.value = false
  passwordKey.value += 1
  passwordVisible.value = true
}

function onPasswordChanged(): void {
  passwordVisible.value = false
  passwordChanged.value = true
}
</script>

<template>
  <section class="page">
    <header class="page__header">
      <div>
        <h1>{{ title }}</h1>
        <p class="page__subtitle">Your own account. Roles are granted by an administrator.</p>
      </div>
      <Button label="Change password" icon="pi pi-key" outlined @click="openPassword" />
    </header>

    <Message v-if="passwordChanged" severity="success" :closable="false" class="page__message">
      Password changed.
    </Message>

    <ProfileView @saved="onSaved" @title="title = $event" />

    <Dialog
      v-model:visible="passwordVisible"
      modal
      :header="passwordTitle"
      :style="{ width: '32rem' }"
    >
      <ProfilePasswordView
        :key="passwordKey"
        @saved="onPasswordChanged"
        @cancel="passwordVisible = false"
        @title="passwordTitle = $event"
      />
    </Dialog>
  </section>
</template>
