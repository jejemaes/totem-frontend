<script setup lang="ts">
import Button from 'primevue/button'
import Card from 'primevue/card'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { computed, onScopeDispose, ref, shallowRef } from 'vue'

import { can } from '@/auth/permissions'
import type { FormData } from '@/components/form/context'
import Field from '@/components/form/fields/Field.vue'
import { htmlOrNull } from '@/components/form/fields/html'
import type { FieldValue } from '@/components/form/fields/types'
import Form from '@/components/form/Form.vue'
import { useResourceForm, type ResourceForm } from '@/composables/useResourceForm'
import {
  fetchCurrentWebsite,
  updateCurrentWebsite,
  type WebsiteDetail,
  type WebsiteUpdatePayload,
} from '@/resources/website'
import { browseWebsiteMedias, uploadWebsiteMedia } from '@/resources/websiteMedias'
import { searchWebsiteMenus } from '@/resources/websiteMenus'
import { displayPage, searchWebsitePages } from '@/resources/websitePages'
import {
  displayTheme,
  listWebsiteThemes,
  searchWebsiteThemes,
  type WebsiteThemeRef,
} from '@/resources/websiteThemes'
import { fetchWebsiteWidgets } from '@/resources/websiteWidgets'

/*
 * The site's own settings, at /website/configuration.
 *
 * A SINGLETON screen, and that is what makes it the odd one in this folder:
 *
 *  - `XxxView` and not `XxxFormView`, although it is a form. That suffix marks
 *    the create/edit sibling of a list; here there is no list, no create and no
 *    delete -- this screen IS the resource.
 *  - the record is addressed as `/current/`, so `id` below is a constant and
 *    `isNew` is always false. The create branch of useResourceForm is
 *    unreachable.
 *  - saving does not navigate: there is nowhere to go back to. The record is
 *    reloaded instead, which re-seeds <Form>'s baseline -- otherwise the fields
 *    would stay dirty and Save enabled over values already written.
 *
 * `theme_options` is NOT edited here. Its shape is the selected theme's
 * `option_schema`, i.e. JSON Schema, and building a form from that is a screen
 * of its own. Leaving it out is also what keeps this one safe: see the note on
 * `updateCurrentWebsite` about what merely sending `theme` does to the options.
 */

/** The `/current/` alias, as an id: there is no pk a client could know. */
const CURRENT = 'current'

/**
 * Read is what the route requires; update is what the actions row needs.
 *
 * Without the update scope the form is rendered READ-ONLY rather than hidden --
 * <Form readonly> disables every field and drops its actions -- which is what
 * lets the menu entry stay honest with a single `totem.website.read` gate.
 *
 * A computed and not a bare `can()` in the template: `can()` instantiates the
 * store on every evaluation.
 */
const canUpdate = computed(() => can('totem.website.update'))

/**
 * The theme picker is shown only to a user holding the theme scope.
 *
 * HIDDEN, not degraded to read-only the way `options.permission` would do it:
 * the theme travels as a bare id with no label of its own, so there is nothing
 * readable to fall back to, and the catalogue is exactly what the scope gates.
 * The field then registers no key, and the payload cannot carry `theme` at all
 * -- which for this field is a relief rather than a limitation, since its mere
 * presence resets `theme_options`.
 */
const canReadThemes = computed(() => can('totem.websitetheme.read'))

/** `FieldValue` is wider than the payload accepts. */
function text(value: FieldValue): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * The theme catalogue, loaded ONCE for the lifetime of the screen.
 *
 * Loaded here and not left to the dropdown, which fetches when it is opened,
 * because the record carries `theme` as a bare id: without a record to describe
 * it <Select> finds no matching option and shows its PLACEHOLDER, so a site
 * with a theme would read as having none until someone opened the panel. Same
 * arrangement as the layout picker on the page form.
 *
 * A failure is swallowed: `theme` below falls back to labelling the value with
 * its own id, and opening the dropdown retries the load anyway.
 */
const themes = shallowRef<WebsiteThemeRef[]>([])

if (canReadThemes.value) {
  const controller = new AbortController()
  onScopeDispose(() => controller.abort())
  void listWebsiteThemes(controller.signal)
    .then((rows) => {
      themes.value = rows
    })
    .catch(() => {})
}

/**
 * The main menu and the homepage of the loaded record, nested.
 *
 * `data` below is the DRAFT -- it carries their ids and nothing else -- so the
 * labels have to come from the record itself.
 */
const menu = ref<WebsiteDetail['menu']>(null)
const homepage = ref<WebsiteDetail['homepage']>(null)

/** Cleared on every save, so it can never describe an older one. */
const saved = ref(false)

/**
 * The record narrowed to the keys the form owns -- named rather than inlined in
 * the options below, because `onSaved` re-seeds with it too.
 *
 * `theme_options` is dropped here, which is what keeps it out of the draft and
 * therefore out of every payload.
 */
function toForm(website: WebsiteDetail): FormData {
  return {
    name: website.name,
    headline: website.headline,
    theme: website.theme,
    homepage: website.homepage?.id ?? null,
    menu: website.menu?.id ?? null,
    meta_authors: website.meta_authors,
    meta_description: website.meta_description,
    // htmlOrNull, not the raw string: a footer stored as "<p></p>" by another
    // client would otherwise seed the draft with a value `isEmpty` reads as
    // filled. The baseline is built from this same object, so it creates no
    // dirt.
    footer: htmlOrNull(website.footer),
    side_bar_content: htmlOrNull(website.side_bar_content),
  }
}

// Annotated, and it has to be: `onSaved` below calls `form.reload()`, so
// without an explicit type the inference is circular (TS7022).
const form: ResourceForm = useResourceForm<WebsiteDetail>({
  // A constant: there is one row, and it is addressed by alias. The composable
  // still watches it, which costs one load and never fires again.
  id: () => CURRENT,
  defaults: {
    name: null,
    headline: null,
    theme: null,
    homepage: null,
    menu: null,
    meta_authors: null,
    meta_description: null,
    footer: null,
    side_bar_content: null,
  },
  toForm,
  fetchOne: (_id, signal) => fetchCurrentWebsite(signal),
  onLoaded: (website) => {
    menu.value = website?.menu ?? null
    homepage.value = website?.homepage ?? null
  },
  // Required by the composable's contract and UNREACHABLE: `id` is a constant,
  // so `save` always takes the update branch. The row is provisioned by the
  // backend; there is no POST route to call.
  create: () => Promise.reject(new Error('The website settings cannot be created.')),
  update: (_id, changed) => updateCurrentWebsite(updatePayload(changed)),
  notFoundMessage: 'The website settings could not be found.',
  onSaved: (website) => {
    saved.value = true
    // Re-seeded from the PATCH RESPONSE rather than reloaded: the route answers
    // the updated record, so this costs no request and no skeleton flash. What
    // it is really for is the NEW `data` object -- that identity change is what
    // makes <Form> reset its baseline. Without it the fields stay dirty over
    // values the backend has already accepted, and Save stays enabled.
    form.data.value = toForm(website)
    menu.value = website.menu
    homepage.value = website.homepage
  },
})

const { data, loading, loadError, saving, error, fieldErrors } = form

/**
 * The record behind the current theme, for `options.record`.
 *
 * Read off the loaded values rather than off the draft: it only has to label
 * the value the form STARTED on -- once the user picks another, the widget has
 * the record it picked. The `{ id }` fallback is what keeps the field labelled
 * when the catalogue could not be loaded, `displayTheme` showing the id itself;
 * returning null there would show the placeholder instead, i.e. an
 * empty-looking field over a value.
 */
const theme = computed<WebsiteThemeRef | { id: string } | null>(() => {
  const id = text(data.value?.theme ?? null)
  if (!id) return null
  return themes.value.find((entry) => entry.id === id) ?? { id }
})

/**
 * Only the keys <Form> reports as edited reach the PATCH -- built key by key,
 * never by copying the draft.
 *
 * `theme` is the one to be careful with, and for a harsher reason than usual:
 * its MERE PRESENCE makes the backend reset `theme_options` to `{}`, whichever
 * value it carries. Sending it only when the user actually picked another theme
 * is therefore not an optimisation -- echoing it back unchanged would silently
 * drop the options of a theme nobody switched away from.
 */
function updatePayload(changed: FormData): WebsiteUpdatePayload {
  const body: WebsiteUpdatePayload = {}
  if ('name' in changed) body.name = text(changed.name) ?? ''
  if ('headline' in changed) body.headline = text(changed.headline) ?? ''
  // Nullable columns: an emptied field clears them with an explicit null.
  if ('meta_authors' in changed) body.meta_authors = text(changed.meta_authors)
  if ('meta_description' in changed) body.meta_description = text(changed.meta_description)
  if ('menu' in changed) body.menu = text(changed.menu)
  if ('homepage' in changed) body.homepage = text(changed.homepage)
  if ('footer' in changed) body.footer = text(changed.footer)
  if ('side_bar_content' in changed) body.side_bar_content = text(changed.side_bar_content)
  // `text()` and not a plain read: the column is NOT NULL, so an empty theme is
  // never sent. The field is `required`, which leaves the dropdown no clear
  // button, so this cannot silently drop an edit the user made.
  if ('theme' in changed) {
    const themeId = text(changed.theme)
    if (themeId) body.theme = themeId
  }
  return body
}

/** A new save must not leave the previous one's confirmation on screen. */
function onSave(values: FormData, changed?: FormData): void {
  saved.value = false
  void form.save(values, changed)
}

/** Throws the edits away by reloading -- there is no list to navigate back to. */
function discard(): void {
  saved.value = false
  void form.reload()
}
</script>

<template>
  <section class="page">
    <header class="page__header">
      <div>
        <h1>Website configuration</h1>
        <p class="page__subtitle">
          Settings of the public website: identity, structure and theme.
        </p>
      </div>
    </header>

    <Message v-if="loadError" severity="error" :closable="false" class="page__message">
      {{ loadError }}
    </Message>

    <Message v-if="error" severity="error" :closable="false" class="page__message">
      {{ error }}
    </Message>

    <Message v-if="saved" severity="success" :closable="false" class="page__message">
      Settings saved.
    </Message>

    <Message v-if="!loadError && !canUpdate" severity="info" :closable="false" class="page__message">
      You may read these settings, but not change them.
    </Message>

    <Card v-if="!loadError" class="website-form">
      <template #content>
        <div v-if="loading" class="website-form__skeleton">
          <Skeleton v-for="n in 7" :key="n" height="3.2rem" />
        </div>

        <Form
          v-else-if="data"
          :data="data"
          save-label="Save"
          :saving="saving"
          :readonly="!canUpdate"
          :errors="fieldErrors"
          @save="onSave"
        >
          <template #default>
            <Field
              name="name"
              widget="string"
              label="Name"
              required
              :options="{ maxLength: 256, placeholder: 'Totem' }"
              help="Shown in the browser tab and wherever the site names itself."
            />

            <Field
              name="headline"
              widget="string"
              label="Headline"
              required
              :options="{ maxLength: 256, placeholder: 'The showcase of your business' }"
            />

            <!-- A relation over a registry rather than over a table: the value
                 is a theme id, which is all this needs to be an ordinary
                 many2one. `filter: false` because the route takes no search
                 parameter and the catalogue is a handful of entries.
                 `required`: the column is NOT NULL, so there is no empty state
                 to offer -- and that also removes the clear button. -->
            <Field
              v-if="canReadThemes"
              name="theme"
              widget="many2one"
              label="Theme"
              required
              :options="{
                fetch: searchWebsiteThemes,
                record: theme,
                relationDisplay: displayTheme,
                filter: false,
              }"
              help="Changing the theme RESETS its options: they are keyed by the options the
                    previous theme declared, and nothing maps them onto another's."
            />

            <!-- The page served at the root of the site. Nullable: a freshly
                 provisioned system has no content yet. -->
            <Field
              name="homepage"
              widget="many2one"
              label="Homepage"
              :options="{
                fetch: searchWebsitePages,
                record: homepage,
                relationDisplay: displayPage,
                permission: 'totem.websitepage.read',
              }"
              help="Page rendered at the root of the website."
            />

            <!-- `name` is label enough for the generic display, so no
                 relationDisplay here. -->
            <Field
              name="menu"
              widget="many2one"
              label="Main menu"
              :options="{
                fetch: searchWebsiteMenus,
                record: menu,
                permission: 'totem.websitemenu.read',
              }"
              help="Parent item whose children make up the site's main menu."
            />

            <Field
              name="meta_authors"
              widget="string"
              label="Meta author"
              :options="{ maxLength: 256 }"
              help="Value of the <meta name=&quot;author&quot;> tag."
            />

            <Field
              name="meta_description"
              widget="text"
              label="Meta description"
              :options="{ rows: 3 }"
              help="Value of the <meta name=&quot;description&quot;> tag, used by search engines."
            />

            <!-- `allowWidget` here, matching HtmlField(allow_widget=True) on
                 Website.footer: like Page.content, this column accepts a
                 <t-widget> marker, so the field may offer to keep one. -->
            <Field
              name="footer"
              widget="html"
              label="Footer"
              :options="{
                rows: 8,
                allowWidget: true,
                fetchWidgets: fetchWebsiteWidgets,
                allowColumns: true,
                widgetPermission: 'totem.websitewidget.read',
                uploadImage: uploadWebsiteMedia,
                uploadPermission: 'totem.websitemedia.create',
                maxUploadBytes: 5 * 1024 * 1024,
                browseImages: browseWebsiteMedias,
                browsePermission: 'totem.websitemedia.read',
              }"
              help="Shown at the bottom of every page of the site."
            />

            <Field
              name="side_bar_content"
              widget="html"
              label="Sidebar Content"
              :options="{
                rows: 8,
                allowWidget: true,
                fetchWidgets: fetchWebsiteWidgets,
                widgetPermission: 'totem.websitewidget.read',
                uploadImage: uploadWebsiteMedia,
                uploadPermission: 'totem.websitemedia.create',
                maxUploadBytes: 5 * 1024 * 1024,
                browseImages: browseWebsiteMedias,
                browsePermission: 'totem.websitemedia.read',
              }"
              help="Shown on page with side bar layout."
            />
          </template>

          <template #actions="{ dirty }">
            <Button
              label="Discard"
              severity="secondary"
              text
              :disabled="saving || !dirty"
              @click="discard"
            />
            <Button
              type="submit"
              label="Save"
              icon="pi pi-check"
              :loading="saving"
              :disabled="!dirty"
            />
          </template>
        </Form>
      </template>
    </Card>
  </section>
</template>

<style scoped>
/* As wide as the page form, and for the same reason: it carries a rich text
   editor, whose toolbar needs the room. */
.website-form {
  max-width: 64rem;
}

.website-form__skeleton {
  display: grid;
  gap: 1rem;
}
</style>
