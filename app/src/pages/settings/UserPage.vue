<script setup lang="ts">
/*
 * /settings/users/new and /settings/users/:id: the page chrome around
 * UserFormView, and where its events become navigation. Kept out of the view on
 * purpose -- "back to the list, with its query string" means nothing inside a
 * Dialog.
 *
 * It also frames the password of the user being edited, in a Dialog: another
 * endpoint under another scope, so not a field of the user form.
 */
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { can } from '@/auth/permissions'
import type { UserDetail } from '@/resources/users'
import UserFormView from '@/views/settings/UserFormView.vue'
import UserPasswordView from '@/views/settings/UserPasswordView.vue'

const route = useRoute()
const router = useRouter()

const id = computed(() => (route.params.id ? String(route.params.id) : null))
const listRoute = computed(() => ({ name: 'settings-users', query: route.query }))
const title = ref('')

/**
 * `totem.user.password`, NOT `totem.user.update`: that is the scope the
 * backend checks, and a role can hold the second without the first -- such a
 * user would get a button that only ever answers 403. No button on a create
 * either: there is no account yet to set a password on.
 */
const canSetPassword = computed(() => id.value !== null && can('totem.user.password'))

function onSaved(user: UserDetail, mode: 'create' | 'edit'): void {
  void router.push(
    mode === 'create'
      ? // The backend's `search` matches login OR email, so the list opens on
        // the row just created. Without it, with the default login-ascending
        // sort and ten rows per page, a new account can land on page 3 and
        // the redirect looks like nothing happened.
        { name: 'settings-users', query: { search: user.login } }
      : listRoute.value,
  )
}

function backToList(): void {
  void router.push(listRoute.value)
}

/*
 * The password Dialog, remounted per open through `passwordKey`, so a cancelled
 * attempt never leaves a password in the draft of the next.
 */
const passwordVisible = ref(false)
const passwordKey = ref(0)
const passwordTitle = ref('')
const passwordChanged = ref(false)

// vue-router reuses this page when only `:id` changes: the banner speaks of the
// previous user and must not survive into the next one.
watch(id, () => {
  passwordChanged.value = false
  passwordVisible.value = false
})

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
        <p class="page__subtitle">
          <template v-if="id === null">
            Roles can be granted right away: permissions are the union of them.
          </template>
          <template v-else>The account status is not editable here.</template>
        </p>
      </div>
      <Button
        v-if="canSetPassword"
        label="Change password"
        icon="pi pi-key"
        outlined
        @click="openPassword"
      />
    </header>

    <Message v-if="passwordChanged" severity="success" :closable="false" class="page__message">
      Password changed.
    </Message>

    <UserFormView
      :id="id"
      @saved="onSaved"
      @cancel="backToList"
      @title="title = $event"
    />

    <Dialog
      v-if="id !== null"
      v-model:visible="passwordVisible"
      modal
      :header="passwordTitle"
      :style="{ width: '32rem' }"
    >
      <UserPasswordView
        :key="passwordKey"
        :user-id="id"
        @saved="onPasswordChanged"
        @cancel="passwordVisible = false"
        @title="passwordTitle = $event"
      />
    </Dialog>
  </section>
</template>
