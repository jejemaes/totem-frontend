<script setup lang="ts">
import Button from 'primevue/button'
import Card from 'primevue/card'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { useConfirm } from 'primevue/useconfirm'
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'

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
import {
  displayLayout,
  listWebsiteLayouts,
  searchWebsiteLayouts,
  type WebsiteLayoutRef,
} from '@/resources/websiteThemes'
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
 * The page form, for both creating and editing, and with NO router: the record
 * comes in as the `id` prop and every way out is an event -- the routed page
 * turns those into navigation, a Dialog into closing itself.
 *
 * Two fields deserve their comment here rather than in the template:
 * `slug` is required and unique, and `date_published` is read-only because the
 * backend owns it -- see updatePayload for the trap that comes with it.
 */
const props = defineProps<{
  /** `null` creates. A prop rather than the route param, so a modal can drive it. */
  id: string | null
}>()

const emit = defineEmits<{
  saved: [page: WebsitePageDetail, mode: 'create' | 'edit']
  /** Cancel, or "Back" after a failed load: the caller decides where that goes. */
  cancel: []
  /** The record is gone: the caller decides where that leaves the user. */
  deleted: []
  /** The heading for whoever frames this form -- a page's <h1>, a Dialog's header. */
  title: [title: string]
}>()

const confirm = useConfirm()

const canDelete = computed(() => can('totem.websitepage.delete'))

/*
 * The layout picker is shown only to a user holding the theme scope.
 *
 * HIDDEN, not degraded to read-only the way `options.permission` would do it:
 * the layout travels as a bare id with no label of its own, so there is nothing
 * readable to fall back to, and the vocabulary is exactly what the scope gates.
 * The field then registers no key at all, and both payloads simply omit it --
 * which is what lets such a user still create a page, on the backend's default.
 *
 * A computed and not a bare `can()` in the template: `can()` instantiates the
 * store on every evaluation.
 */
const canReadLayouts = computed(() => can('totem.websitetheme.read'))

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

/**
 * The layout vocabulary, loaded ONCE for the lifetime of the screen.
 *
 * Loaded here and not left to the dropdown, which fetches when it is opened,
 * because the page detail carries `layout` as a bare id: without a record to
 * describe it <Select> finds no matching option and shows its PLACEHOLDER, so a
 * page with a layout would read as having none until someone opened the panel.
 *
 * A failure is swallowed: `layout` below falls back to labelling the
 * value with its own id, and opening the dropdown retries the load anyway.
 */
const layouts = shallowRef<WebsiteLayoutRef[]>([])

if (canReadLayouts.value) {
  const controller = new AbortController()
  onScopeDispose(() => controller.abort())
  void listWebsiteLayouts(controller.signal)
    .then((rows) => {
      layouts.value = rows
    })
    .catch(() => {})
}

const form = useResourceForm<WebsitePageDetail>({
  // A getter: the routed page reuses this component when only the param
  // changes, and the prop follows it.
  id: () => props.id,
  defaults: {
    title: null,
    slug: null,
    user: null,
    // Not nullable server-side, merely defaulted: the form starts at `false`
    // so a create never has to send null.
    is_published: false,
    content: null,
    date_published: null,
    layout: null,
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
    layout: page.layout,
  }),
  fetchOne: fetchWebsitePage,
  onLoaded: (page) => {
    user.value = page?.user ?? null
  },
  create: (values) => createWebsitePage(createPayload(values)),
  update: (id, changed) => updateWebsitePage(id, updatePayload(changed)),
  notFoundMessage: 'This page no longer exists.',
  onSaved: (page, mode) => emit('saved', page, mode),
})

const { isNew, data, loading, loadError, saving, error, fieldErrors } = form

/**
 * The record behind the current layout, for `options.record`.
 *
 * Read off the loaded values rather than off the draft: it only has to label
 * the value the form STARTED on -- once the user picks another, the widget has
 * the record it picked. The `{ id }` fallback is what keeps the field labelled
 * when the vocabulary could not be loaded, `displayLayout` showing the id
 * itself; returning null there would show the placeholder instead, i.e. an
 * empty-looking field over a value.
 */
const layout = computed<WebsiteLayoutRef | { id: string } | null>(() => {
  const id = text(data.value?.layout ?? null)
  if (!id) return null
  return layouts.value.find((entry) => entry.id === id) ?? { id }
})

/*
 * Both payloads are built key by key, never by copying the draft -- which is
 * also what keeps `date_published` out of them: it is registered as a field, so
 * it IS in the draft, but the write schemas do not accept it.
 */
function createPayload(values: FormData): WebsitePageCreatePayload {
  const payload: WebsitePageCreatePayload = {
    title: text(values.title) ?? '',
    slug: text(values.slug) ?? '',
    content: text(values.content) ?? '',
    is_published: bool(values.is_published),
    user: text(values.user),
  }
  // Only when there is one to send. The key is absent from the draft for a user
  // without the theme scope, and null on a create nobody touched it on -- and
  // an OMITTED layout is what makes the backend apply its own default, where a
  // `null` would be written to a NOT NULL column.
  const layoutId = text(values.layout)
  if (layoutId) payload.layout = layoutId
  return payload
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
  // `text()` and not a plain read: the column is NOT NULL, so an empty layout
  // is never sent. The field is `required`, which leaves the dropdown no clear
  // button, so this cannot silently drop an edit the user made.
  if ('layout' in changed) {
    const layoutId = text(changed.layout)
    if (layoutId) body.layout = layoutId
  }
  return body
}

const title = computed(() => {
  if (isNew.value) return 'New page'
  return text(data.value?.title ?? null) ?? 'Page'
})
const saveLabel = computed(() => (isNew.value ? 'Create' : 'Save'))

watch(title, (value) => emit('title', value), { immediate: true })

const deleting = ref(false)
const deleteError = ref<string | null>(null)

/**
 * A page a menu item points at cannot be removed: that FK is
 * `on_delete=PROTECT`. The refusal is shown as-is rather than translated: the
 * backend names the reason better than a generic message would.
 */
async function remove(): Promise<void> {
  const id = props.id ?? ''
  if (!id) return

  deleting.value = true
  deleteError.value = null
  try {
    await deleteWebsitePage(id)
    emit('deleted')
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
  <Message v-if="loadError" severity="error" :closable="false" class="page__message">
    <div class="form__error">
      <span>{{ loadError }}</span>
      <Button label="Back" size="small" severity="danger" outlined @click="emit('cancel')" />
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

          <!-- A rich text editor, not a textarea.

               `allowWidget` matches HtmlField(allow_widget=True) on
               Page.content -- the website's own footer and sidebar carry the
               same flag, and the configuration screen sets it for the same
               reason.

               `allowColumns` mirrors no backend flag: a two-column block is
               plain <div class="t-row"> HTML that every HtmlField accepts.
               It is on HERE and not on the footer or the sidebar because a
               page body is the only one of the three wide enough for it. -->
          <Field
            name="content"
            widget="html"
            label="Content"
            required
            :options="{
              rows: 14,
              placeholder: 'Tell them about us…',
              allowWidget: true,
              allowColumns: true,
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

          <!-- A relation over a vocabulary rather than over a table: the
               value is a layout id, which is all this needs to be an ordinary
               many2one. `filter: false` because the route takes no search
               parameter and the whole vocabulary is a handful of entries, so
               a filter box would refetch the same list on every keystroke.
               `required`: the column is NOT NULL, so there is no empty state
               to offer -- and that also removes the clear button. -->
          <Field
            v-if="canReadLayouts"
            name="layout"
            widget="many2one"
            label="Layout"
            required
            :options="{
              fetch: searchWebsiteLayouts,
              record: layout,
              relationDisplay: displayLayout,
              filter: false,
            }"
            help="Structure of the page body. A theme that does not implement it falls back
                  when the page renders, so switching theme cannot invalidate a page."
          />
        </template>

        <template #actions="{ dirty }">
          <!-- Left-aligned, away from Save: a destructive action does not
               sit next to the button the user reaches for. -->
          <Button
            v-if="!isNew && canDelete"
            label="Delete"
            icon="pi pi-trash"
            severity="danger"
            text
            class="form__delete"
            :loading="deleting"
            :disabled="saving"
            @click="askDelete"
          />
          <Button
            label="Cancel"
            severity="secondary"
            text
            :disabled="saving"
            @click="emit('cancel')"
          />
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

.form__delete {
  margin-right: auto;
}

.form__error {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
</style>
