<script setup lang="ts">
/*
 * /settings/users/new and /settings/users/:id: the page chrome around
 * UserFormView, and where its events become navigation. Kept out of the view on
 * purpose -- "back to the list, with its query string" means nothing inside a
 * Dialog.
 *
 * It also frames the password of the user being edited, in a Dialog: another
 * endpoint under another scope, so not a field of the user form. The button
 * that opens it is the form's "Change password" record action, declared by
 * UserFormView -- with its scope -- and drawn beside the form; it reaches this
 * page as an event.
 */
import Dialog from 'primevue/dialog'
import Message from 'primevue/message'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import type { UserDetail } from '@/resources/users'
import UserFormView from '@/views/settings/UserFormView.vue'
import UserPasswordView from '@/views/settings/UserPasswordView.vue'

const route = useRoute()
const router = useRouter()

const id = computed(() => (route.params.id ? String(route.params.id) : null))
const listRoute = computed(() => ({ name: 'settings-users', query: route.query }))
const title = ref('')

/*
 * The form STAYS open after a save: an edit needs nothing here, and a create
 * moves to the new record's own route, where the next Save is an update.
 * `replace`, so Back skips the blank create form and lands on the list, with
 * the query string it came with.
 */
function onSaved(user: UserDetail, mode: 'create' | 'edit'): void {
  if (mode !== 'create') return
  void router.replace({
    name: 'settings-user-edit',
    params: { id: String(user.id) },
    query: route.query,
  })
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
    </header>

    <Message v-if="passwordChanged" severity="success" :closable="false" class="page__message">
      Password changed.
    </Message>

    <UserFormView
      :id="id"
      @saved="onSaved"
      @cancel="backToList"
      @title="title = $event"
      @change-password="openPassword"
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
