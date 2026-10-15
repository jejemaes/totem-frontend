<script setup lang="ts">
/*
 * /settings/users/new and /settings/users/:id: the page chrome around
 * UserFormView, and where its events become navigation. Kept out of the view on
 * purpose -- "back to the list, with its query string" means nothing inside a
 * Dialog.
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import type { UserDetail } from '@/resources/users'
import UserFormView from '@/views/settings/UserFormView.vue'

const route = useRoute()
const router = useRouter()

const id = computed(() => (route.params.id ? String(route.params.id) : null))
const listRoute = computed(() => ({ name: 'settings-users', query: route.query }))
const title = ref('')

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

    <UserFormView
      :id="id"
      @saved="onSaved"
      @cancel="backToList"
      @title="title = $event"
    />
  </section>
</template>
