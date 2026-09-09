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
import Field from '@/components/form/fields/Field.vue'
import { htmlOrNull } from '@/components/form/fields/html'
import type { FieldValue } from '@/components/form/fields/types'
import Form from '@/components/form/Form.vue'
import { useResourceForm } from '@/composables/useResourceForm'
import { displayUser, searchUsers, type UserRef } from '@/resources/users'
import { browseWebsiteMedias, uploadWebsiteMedia } from '@/resources/websiteMedias'
import { fetchWebsiteWidgets } from '@/resources/websiteWidgets'
import {
  createWebsitePage,
  deleteWebsitePage,
  fetchWebsitePage,
  updateWebsitePage,
  type WebsitePageCreatePayload,
  type WebsitePageDetail,
  type WebsitePageUpdatePayload,
} from '@/resources/websitePages'

/*
 * One screen for both routes: /website/pages/new and /website/pages/:id.
 *
 * Two fields deserve their comment here rather than in the template:
 * `slug` is required and unique, and `date_published` is read-only because the
 * backend owns it -- see updatePayload for the trap that comes with it.
 */
const router = useRouter()
const route = useRoute()
const confirm = useConfirm()

const listRoute = computed(() => ({ name: 'website-pages', query: route.query }))

const canDelete = computed(() => can('totem.websitepage.delete'))

/** `FieldValue` is wider than the payload accepts. */
function text(value: FieldValue): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function bool(value: FieldValue): boolean {
  return value === true
}

/**
 * The author of the loaded record, nested.
 *
 * `data` below is the DRAFT -- it carries the id and nothing else -- so the
 * label has to come from the record itself. Re-seeded through `onLoaded`, the
 * only hook that fires when the route param changes under a reused component.
 */
const user = ref<UserRef | null>(null)

const form = useResourceForm<WebsitePageDetail>({
  id: () => (route.params.id ? String(route.params.id) : null),
  defaults: {
    title: null,
    slug: null,
    user: null,
    // Not nullable server-side, merely defaulted: the form starts at `false`
    // so a create never has to send null.
    is_published: false,
    content: null,
    date_published: null,
  },
  toForm: (page) => ({
    title: page.title,
    slug: page.slug,
    user: page.user?.id ?? null,
    is_published: page.is_published,
    // htmlOrNull, not the raw string: a record stored as "<p></p>" by another
    // client would otherwise seed the draft with a value `isEmpty` reads as
    // filled, and `required` below would pass on an empty page body. The
    // baseline is built from this same object, so it creates no dirt.
    content: htmlOrNull(page.content),
    date_published: page.date_published,
  }),
  fetchOne: fetchWebsitePage,
  onLoaded: (page) => {
    user.value = page?.user ?? null
  },
  create: (values) => createWebsitePage(createPayload(values)),
  update: (id, changed) => updateWebsitePage(id, updatePayload(changed)),
  notFoundMessage: 'This page no longer exists.',
  onSaved: (page, mode) =>
    router.push(
      mode === 'create'
        ? // The backend's `search` matches the title or the slug, so the list
          // opens on the row just created instead of wherever the title sort
          // puts it.
          { name: 'website-pages', query: { search: page.title } }
        : listRoute.value,
    ),
})

const { isNew, data, loading, loadError, saving, error, fieldErrors } = form

/*
 * Both payloads are built key by key, never by copying the draft -- which is
 * also what keeps `date_published` out of them: it is registered as a field, so
 * it IS in the draft, but the write schemas do not accept it.
 */
function createPayload(values: FormData): WebsitePageCreatePayload {
  return {
    title: text(values.title) ?? '',
    slug: text(values.slug) ?? '',
    content: text(values.content) ?? '',
    is_published: bool(values.is_published),
    user: text(values.user),
  }
}

/**
 * Only the keys <Form> reports as edited reach the PATCH.
 *
 * `is_published` is the one to be careful with: the backend restamps
 * `date_published` on the MERE PRESENCE of that key, whichever way the flag is
 * flipped. Sending it only when the user actually toggled it is therefore not
 * an optimisation -- echoing it back unchanged would rewrite the publication
 * date of a page nobody republished.
 */
function updatePayload(changed: FormData): WebsitePageUpdatePayload {
  const body: WebsitePageUpdatePayload = {}
  if ('title' in changed) body.title = text(changed.title) ?? ''
  if ('slug' in changed) body.slug = text(changed.slug) ?? ''
  if ('content' in changed) body.content = text(changed.content) ?? ''
  if ('is_published' in changed) body.is_published = bool(changed.is_published)
  if ('user' in changed) body.user = text(changed.user)
  return body
}

const title = computed(() => {
  if (isNew.value) return 'New page'
  return text(data.value?.title ?? null) ?? 'Page'
})
const saveLabel = computed(() => (isNew.value ? 'Create' : 'Save'))

const deleting = ref(false)
const deleteError = ref<string | null>(null)

/**
 * A page a menu item points at cannot be removed: that FK is
 * `on_delete=PROTECT`. The refusal is shown as-is rather than translated: the
 * backend names the reason better than a generic message would.
 */
async function remove(): Promise<void> {
  const id = route.params.id ? String(route.params.id) : ''
  if (!id) return

  deleting.value = true
  deleteError.value = null
  try {
    await deleteWebsitePage(id)
    await router.push(listRoute.value)
  } catch (caught) {
    deleteError.value =
      caught instanceof ApiError ? caught.message : 'This page could not be deleted.'
  } finally {
    deleting.value = false
  }
}

function askDelete(): void {
  confirm.require({
    header: 'Delete this page?',
    message: `“${title.value}” will be removed from the website.`,
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

    <Card v-if="!loadError" class="page-form">
      <template #content>
        <div v-if="loading" class="page-form__skeleton">
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
          <template #default>
            <Field
              name="title"
              widget="string"
              label="Title"
              required
              :options="{ maxLength: 256, placeholder: 'About us' }"
            />

            <!-- Required by the create schema and unique across the instance: a
                 clash comes back as a field error here. -->
            <Field
              name="slug"
              widget="string"
              label="Slug"
              required
              :options="{ maxLength: 256, placeholder: 'about-us' }"
              help="URL part: letters, digits, hyphens and underscores."
            />

            <!-- A relation: the draft holds the id, `record` is the nested
                 author the GET already returned, so read-only mode costs no
                 request. -->
            <Field
              name="user"
              widget="many2one"
              label="Author"
              :options="{
                fetch: searchUsers,
                record: user,
                relationDisplay: displayUser,
                permission: 'totem.user.read',
              }"
            />

            <Field name="is_published" widget="boolean" label="Published" required />

            <!-- A rich text editor, not a textarea. `allowWidget` here and
                 nowhere else, matching HtmlField(allow_widget=True) on
                 Page.content: this is the only column in the app that accepts a
                 <t-widget> marker, so it is the only <Field> that should offer
                 to keep one. -->
            <Field
              name="content"
              widget="html"
              label="Content"
              required
              :options="{
                rows: 14,
                placeholder: 'Tell them about us…',
                allowWidget: true,
                fetchWidgets: fetchWebsiteWidgets,
                widgetPermission: 'totem.websitewidget.read',
                uploadImage: uploadWebsiteMedia,
                uploadPermission: 'totem.websitemedia.create',
                maxUploadBytes: 5 * 1024 * 1024,
                browseImages: browseWebsiteMedias,
                browsePermission: 'totem.websitemedia.read',
              }"
              help="Rich text. Switch to the source view to edit the HTML directly; the
                    backend validates the tags and attributes it accepts."
            />

            <!-- Owned by the backend: it stamps this whenever the publication
                 state changes, and the write schemas do not accept it. -->
            <Field
              name="date_published"
              widget="datetime"
              label="Publication date"
              readonly
              help="Set by the backend when the publication state changes."
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
/* Wider than the other forms: this one carries a rich text editor, whose
   toolbar needs the room and whose tables are unusable in a narrow column. */
.page-form {
  max-width: 64rem;
}

.page-form__skeleton {
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
