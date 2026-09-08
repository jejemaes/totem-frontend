<script setup lang="ts">
import Button from 'primevue/button'
import Card from 'primevue/card'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { useConfirm } from 'primevue/useconfirm'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ApiError } from '@/api/client'
import { can } from '@/auth/permissions'
import type { FormData } from '@/components/form/context'
import { activeSwitchField, type FieldSwitchChoice } from '@/components/form/fieldSwitch'
import FieldSwitch from '@/components/form/FieldSwitch.vue'
import Field from '@/components/form/fields/Field.vue'
import type { FieldValue } from '@/components/form/fields/types'
import Form from '@/components/form/Form.vue'
import { useResourceForm } from '@/composables/useResourceForm'
import {
  createWebsiteMenu,
  deleteWebsiteMenu,
  fetchWebsiteMenu,
  isMenuDescendant,
  menuTargetPayload,
  searchWebsiteMenus,
  updateWebsiteMenu,
  type MenuTargetType,
  type WebsiteMenuCreatePayload,
  type WebsiteMenuDetail,
  type WebsiteMenuRef,
  type WebsiteMenuUpdatePayload,
} from '@/resources/websiteMenus'
import {
  displayPage,
  searchWebsitePages,
  type WebsitePageRef,
} from '@/resources/websitePages'

/*
 * One screen for both routes: /website/menus/new and /website/menus/:id.
 *
 * What is specific to a menu item is the target: the backend stores NO
 * discriminator, so "page or link" is deduced from which of the two fields is
 * filled. <FieldSwitch> is the generic UI for that, and menuTargetPayload is
 * what makes the abandoned side go out as an explicit null.
 */
const router = useRouter()
const route = useRoute()
const confirm = useConfirm()

/** The list's own query rides along, so Cancel lands where the user left. */
const listRoute = computed(() => ({ name: 'website-menus', query: route.query }))

const canDelete = computed(() => can('totem.websitemenu.delete'))

/** `FieldValue` is wider than the payload accepts. */
function text(value: FieldValue): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function num(value: FieldValue): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function bool(value: FieldValue): boolean {
  return value === true
}

/** The two mutually exclusive target fields, in the order the switch shows. */
const TARGET_CHOICES: FieldSwitchChoice[] = [
  { field: 'page', label: 'Page' },
  { field: 'link', label: 'Link' },
]

/**
 * The user's pick. `null` means "deduce it from the record", which is the state
 * every load starts from -- see activeTarget.
 */
const targetChoice = ref<string | null>(null)

/**
 * The parent and the page of the loaded record, nested.
 *
 * `data` below is the DRAFT -- it carries their ids and nothing else -- so the
 * labels have to come from the records themselves. Re-seeded through
 * `onLoaded`, the only hook that fires when the route param changes under a
 * reused component.
 */
const parent = ref<WebsiteMenuRef | null>(null)
const page = ref<WebsitePageRef | null>(null)

const form = useResourceForm<WebsiteMenuDetail>({
  // A getter, not a plain value: vue-router reuses this component when only
  // the param changes. `null` on the create route.
  id: () => (route.params.id ? String(route.params.id) : null),
  defaults: {
    name: null,
    // The column is not nullable and the backend defaults it to 20: the form
    // starts there rather than empty, so a create never has to send null.
    sequence: 20,
    parent: null,
    new_window: false,
    page: null,
    link: null,
  },
  // Both relations are flattened to their ids: the draft carries what a PATCH
  // sends, and the nested objects go to the fields' `record` option instead.
  toForm: (menu) => ({
    name: menu.name,
    sequence: menu.sequence,
    parent: menu.parent?.id ?? null,
    new_window: menu.new_window,
    page: menu.page?.id ?? null,
    link: menu.link,
  }),
  fetchOne: fetchWebsiteMenu,
  onLoaded: (menu) => {
    parent.value = menu?.parent ?? null
    page.value = menu?.page ?? null
    // Back to "deduce it": the switch must open on the target the NEW record
    // actually stores, not on the previous record's position.
    targetChoice.value = null
  },
  create: (values) => createWebsiteMenu(createPayload(values)),
  update: (id, changed) => updateWebsiteMenu(id, updatePayload(changed)),
  notFoundMessage: 'This menu item no longer exists.',
  // No `hasExternalChanges`: the switch is not data. Flipping it without
  // filling the new target changes nothing about the record, so the form is
  // rightly not dirty.
  onSaved: (menu, mode) =>
    router.push(
      mode === 'create'
        ? // The backend's `search` matches the name, so the list opens on the
          // row just created instead of wherever the sequence sort puts it.
          { name: 'website-menus', query: { search: menu.name } }
        : listRoute.value,
    ),
})

const { isNew, data, loading, loadError, saving, error, fieldErrors } = form

/**
 * The active target: the user's pick, else deduced from the record.
 *
 * Derived from `data` -- what useResourceForm seeded -- and NOT from the live
 * draft: emptying the link field mid-typing would leave both targets empty and
 * flip the switch to Page under the user's fingers. `data` only changes when a
 * new record lands, which is exactly how often a deduction should be redone.
 */
const activeTarget = computed<MenuTargetType>(
  () => (activeSwitchField(TARGET_CHOICES, data.value ?? {}, targetChoice.value) ?? 'page') as MenuTargetType,
)

/**
 * Candidates for the parent dropdown, minus the ones that would make a cycle:
 * the item itself and its descendants.
 *
 * The backend refuses both with a 422 on `parent`; this only keeps an
 * impossible choice out of the list.
 */
async function searchParents(
  search: string | null,
  signal?: AbortSignal,
): Promise<WebsiteMenuRef[]> {
  const candidates = await searchWebsiteMenus(search, signal)
  const id = route.params.id ? String(route.params.id) : ''
  return candidates.filter((candidate) => !isMenuDescendant(candidate, id))
}

/*
 * Both payloads are built key by key, never by copying the draft.
 *
 * The target is the interesting part: menuTargetPayload always names BOTH keys,
 * with the inactive one null. On a create that drops a value the user typed
 * before switching (an unmounted <Field v-if> keeps its value in the draft); on
 * an update it is the only way to clear the abandoned side, since an omitted
 * key is left untouched by `exclude_unset=True`.
 */
function createPayload(values: FormData): WebsiteMenuCreatePayload {
  return {
    name: text(values.name) ?? '',
    sequence: num(values.sequence) ?? 20,
    parent: text(values.parent),
    new_window: bool(values.new_window),
    ...menuTargetPayload(activeTarget.value, {
      page: text(values.page),
      link: text(values.link),
    }),
  }
}

/**
 * Only the keys <Form> reports as edited reach the PATCH: an untouched field
 * must not be echoed back, and an empty body would be a no-op the backend
 * reports as a 404.
 */
function updatePayload(changed: FormData): WebsiteMenuUpdatePayload {
  const body: WebsiteMenuUpdatePayload = {}
  if ('name' in changed) body.name = text(changed.name) ?? ''
  if ('sequence' in changed) body.sequence = num(changed.sequence) ?? 20
  if ('parent' in changed) body.parent = text(changed.parent)
  if ('new_window' in changed) body.new_window = bool(changed.new_window)

  // Triggered by an edited target field, not by the switch: flipping it without
  // filling the new target changes no data and must send nothing.
  //
  // `changed` is enough on its own -- only the ACTIVE field is rendered, so
  // only it can have been edited, and the inactive one goes out as null
  // whatever it held.
  if ('page' in changed || 'link' in changed) {
    Object.assign(
      body,
      menuTargetPayload(activeTarget.value, {
        page: text(changed.page ?? null),
        link: text(changed.link ?? null),
      }),
    )
  }
  return body
}

const title = computed(() => {
  if (isNew.value) return 'New menu item'
  return text(data.value?.name ?? null) ?? 'Menu item'
})
const saveLabel = computed(() => (isNew.value ? 'Create' : 'Save'))

const deleting = ref(false)
const deleteError = ref<string | null>(null)

/**
 * `parent` is `on_delete=PROTECT`, so an item with children cannot be removed.
 * The refusal is shown as-is rather than translated: the backend names the
 * reason better than a generic message would.
 */
async function remove(): Promise<void> {
  const id = route.params.id ? String(route.params.id) : ''
  if (!id) return

  deleting.value = true
  deleteError.value = null
  try {
    await deleteWebsiteMenu(id)
    await router.push(listRoute.value)
  } catch (caught) {
    deleteError.value =
      caught instanceof ApiError ? caught.message : 'This menu item could not be deleted.'
  } finally {
    deleting.value = false
  }
}

function askDelete(): void {
  confirm.require({
    header: 'Delete this menu item?',
    message: `“${title.value}” will be removed from the website menu.`,
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', text: true },
    acceptProps: { label: 'Delete', severity: 'danger' },
    accept: () => {
      void remove()
    },
  })
}
</script>

<template>
  <section class="page">
    <header class="page__header">
      <div class="page__heading">
        <h1>{{ title }}</h1>
        <Button
          v-if="!isNew && canDelete"
          label="Delete"
          icon="pi pi-trash"
          severity="danger"
          outlined
          size="small"
          :loading="deleting"
          :disabled="saving"
          @click="askDelete"
        />
      </div>
    </header>

    <Message v-if="loadError" severity="error" :closable="false" class="page__message">
      <div class="page__error">
        <span>{{ loadError }}</span>
        <RouterLink :to="listRoute">
          <Button label="Back to the list" size="small" severity="danger" outlined />
        </RouterLink>
      </div>
    </Message>

    <Message v-if="deleteError" severity="error" :closable="false" class="page__message">
      {{ deleteError }}
    </Message>

    <Message v-if="error" severity="error" :closable="false" class="page__message">
      {{ error }}
    </Message>

    <Card v-if="!loadError" class="menu-form">
      <template #content>
        <div v-if="loading" class="menu-form__skeleton">
          <Skeleton v-for="n in 6" :key="n" height="3.2rem" />
        </div>

        <Form
          v-else-if="data"
          :data="data"
          :save-label="saveLabel"
          :saving="saving"
          :errors="fieldErrors"
          @save="form.save"
        >
          <template #default="{ draft }">
            <Field
              name="name"
              widget="string"
              label="Name"
              required
              :options="{ maxLength: 256, placeholder: 'About us' }"
            />

            <Field
              name="sequence"
              widget="integer"
              label="Sequence"
              required
              :options="{ min: 0 }"
              help="Ordering among the items sharing the same parent."
            />

            <!-- A relation: the draft holds the id, `record` is the nested
                 parent the GET already returned. The candidates exclude this
                 item and its own descendants. -->
            <Field
              name="parent"
              widget="many2one"
              label="Parent"
              :options="{
                fetch: searchParents,
                record: parent,
                permission: 'totem.websitemenu.read',
              }"
              help="Leave empty for a top-level item."
            />

            <Field name="new_window" widget="boolean" label="Open in a new window" required />

            <!-- Purely visual: the backend has no field for this. Which target
                 is active is deduced from the two fields below, and this only
                 lets the user override that deduction. -->
            <FieldSwitch
              v-model="targetChoice"
              :choices="TARGET_CHOICES"
              :values="data"
              label="Target"
              :readonly="saving"
            />

            <!-- `required` follows the parent, which is the check constraint
                 rendered client-side: a CHILD item needs a page or a link, a
                 top-level one needs neither. <Field> evaluates `required` in a
                 watchEffect, so a reactive expression works as-is. -->
            <Field
              v-if="activeTarget === 'page'"
              name="page"
              widget="many2one"
              label="Target page"
              :required="!!draft.parent"
              :options="{
                fetch: searchWebsitePages,
                record: page,
                relationDisplay: displayPage,
                permission: 'totem.websitepage.read',
              }"
              help="A child item needs a page or a link."
            />

            <Field
              v-else
              name="link"
              widget="string"
              label="Target link"
              :required="!!draft.parent"
              :options="{ maxLength: 256, placeholder: 'https://example.com' }"
              help="A child item needs a page or a link."
            />
          </template>

          <template #actions="{ dirty }">
            <RouterLink :to="listRoute">
              <Button label="Cancel" severity="secondary" text :disabled="saving" />
            </RouterLink>
            <Button
              type="submit"
              :label="saveLabel"
              icon="pi pi-check"
              :loading="saving"
              :disabled="!isNew && !dirty"
            />
          </template>
        </Form>
      </template>
    </Card>
  </section>
</template>

<style scoped>
/* A full-width form is unreadable: the fields themselves are short. */
.menu-form {
  max-width: 36rem;
}

.menu-form__skeleton {
  display: grid;
  gap: 1rem;
}

.page__heading {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.page__error {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
</style>
