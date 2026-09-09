<script setup lang="ts">
import Card from 'primevue/card'
import { computed, ref } from 'vue'

import type { FormData } from '@/components/form/context'
import { activeSwitchField, type FieldSwitchChoice } from '@/components/form/fieldSwitch'
import type {
  HtmlImageBrowse,
  HtmlImageItem,
  HtmlImageUpload,
} from '@/components/form/fields/html'
import FieldSwitch from '@/components/form/FieldSwitch.vue'
import Field from '@/components/form/fields/Field.vue'
import Form from '@/components/form/Form.vue'

/*
 * Demo page: nothing is sent to the backend. It exists so a form definition can
 * be read side by side with what the components make of it.
 *
 * Two keys are worth attention:
 *  - `note_text` is ABSENT: its <Field> carries a `default`, which therefore
 *    fills the draft and shows up in the payload.
 *  - `colour` is null: that is a real value, so its <Field>'s `default` does
 *    NOT overwrite it.
 */
const data = ref<FormData>({
  name: 'Totem',
  description: 'Reception kiosk in the main hall.',
  colour: null,
  quantity: 12,
  rating: 3.14159,
  due_date: '2024-03-31',
  seen_at: '2024-03-31T14:22:00+02:00',
  swatch: 12,
  target_page: 'about-us',
  target_link: null,
  active: true,
  published: null,
  status: 'draft',
  reference: 'REF-001',
  body: '<h2>About us</h2><p>A <strong>reception kiosk</strong> in the main hall.</p>',
  // Deliberately carries a marker AND a <section>, neither of which the editor
  // schema knows without `allowWidget`: this field must therefore open in
  // source mode rather than parsing them away. It is the only place that
  // degradation can be seen without a backend.
  legacy_body:
    '<section><p>Written in the old textarea.</p></section>' +
    '<t-widget name="last-page" attrs=\'{"limit":5}\'></t-widget>',
})

/*
 * A fake media store, so the editor's image picker can be exercised here.
 *
 * In-memory and offline, like everything else on this page: `uploadImage` and
 * `browseImages` are plain functions the caller supplies, so a demo can satisfy
 * their contract with data URIs and never touch /website/medias/. The real ones
 * live in resources/websiteMedias.
 */
const SWATCHES = ['4f46e5', '0891b2', 'ca8a04', 'be123c', '15803d', '7c3aed']

function fakeImage(label: string, colour: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160">
    <rect width="240" height="160" fill="#${colour}"/>
    <text x="120" y="88" font-family="sans-serif" font-size="22" fill="#fff"
          text-anchor="middle">${label}</text>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/** Enough rows for the picker's paginator to have something to do. */
const LIBRARY: HtmlImageItem[] = Array.from({ length: 27 }, (_, index) => {
  const kind = index % 3 === 0 ? 'diagram' : index % 3 === 1 ? 'photo' : 'logo'
  const name = `${kind}-${String(index + 1).padStart(2, '0')}.png`
  return {
    id: String(index),
    url: fakeImage(name, SWATCHES[index % SWATCHES.length]),
    name,
    mimetype: 'image/png',
  }
})

/** Paged and searched in memory, the same shape the backend answers. */
const demoBrowse: HtmlImageBrowse = async (query) => {
  const term = query.search?.toLowerCase() ?? ''
  const matches = term ? LIBRARY.filter((item) => item.name.includes(term)) : LIBRARY
  const start = (query.page - 1) * query.pageSize
  return { items: matches.slice(start, start + query.pageSize), total: matches.length }
}

/** Reads the picked file into a data URI: no request, no endpoint. */
const demoUpload: HtmlImageUpload = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve({ url: String(reader.result), name: file.name })
    reader.onerror = () => reject(new Error('This file could not be read.'))
    reader.readAsDataURL(file)
  })

const saved = ref<FormData | null>(null)
const changed = ref<FormData | null>(null)

/*
 * Two mutually exclusive fields, and the switch that picks between them.
 *
 * `null` means "deduce it": `target_page` is filled above and `target_link` is
 * not, so the form opens on Page without being told to. Note in the live draft
 * below that the hidden field KEEPS its value -- a payload has to null it
 * explicitly, which is what a resource module does.
 */
const TARGET_CHOICES: FieldSwitchChoice[] = [
  { field: 'target_page', label: 'Page' },
  { field: 'target_link', label: 'Link' },
]
const targetChoice = ref<string | null>(null)

/** The same call the switch makes, so the `v-if` below agrees with what it shows. */
const activeTarget = computed(() =>
  activeSwitchField(TARGET_CHOICES, data.value, targetChoice.value),
)

/** <Form> hands over the whole draft and, separately, only the keys that differ
    from `data` -- what an update should actually PATCH. */
function onSave(payload: FormData, edited: FormData): void {
  saved.value = payload
  changed.value = edited
}

/** A copy of the template below, so the page documents itself. */
const DEFINITION = `<Form :data="data" @save="onSave">
  <Field name="name"        widget="string"    label="Name" required />
  <Field name="description" widget="text"      label="Description" :options="{ rows: 3 }" />
  <Field name="note_text"   widget="string"    label="Note" default="Nothing to report" />
  <Field name="colour"      widget="selection" label="Colour" default="blue"
         :options="{ choices: ['blue', 'red', 'green'] }" />
  <Field name="quantity"    widget="integer"   label="Quantity" :options="{ min: 0 }" />
  <Field name="rating"      widget="float"     label="Rating" />
  <Field name="due_date"    widget="date"      label="Due date" />
  <Field name="seen_at"     widget="datetime"  label="Seen at" />
  <Field name="swatch"      widget="color"     label="Swatch" :options="{ max: 15 }" />
  <Field name="active"      widget="boolean"   label="Active" required />
  <Field name="published"   widget="boolean"   label="Published" />
  <Field name="status"      widget="selection" label="Status"
         :options="{ choices: [
           { value: 'draft', label: 'Draft' },
           { value: 'done',  label: 'Done' },
         ] }" />
  <Field name="reference"   widget="string"    label="Reference" readonly />
  <Field name="body"        widget="html"      label="Body" required
         :options="{ rows: 8, allowWidget: true,
                     uploadImage: demoUpload, browseImages: demoBrowse }" />
  <Field name="legacy_body" widget="html"      label="Legacy body" />
  <FieldSwitch v-model="targetChoice" :choices="TARGET_CHOICES" :values="data" label="Target" />
  <Field v-if="activeTarget === 'target_page'" name="target_page" widget="string" label="Page" />
  <Field v-else                                name="target_link" widget="string" label="Link" />
</Form>`
</script>

<template>
  <section class="page">
    <header class="page__header">
      <div>
        <h1>Form demo</h1>
        <p class="page__subtitle">
          The <code>Form</code> and <code>Field</code> components. Nothing is sent to the backend.
        </p>
      </div>
    </header>

    <div class="cards">
      <Card>
        <template #title>Form</template>
        <template #content>
          <Form :data="data" v-slot="{ draft, dirty }" @save="onSave">
            <Field name="name" widget="string" label="Name" required
                   help="Required: clear it and save to see the error." />

            <Field name="description" widget="text" label="Description" :options="{ rows: 3 }" />

            <Field name="note_text" widget="string" label="Note" default="Nothing to report"
                   help="Key absent from `data`: the value comes from `default`." />

            <Field name="colour" widget="selection" label="Colour" default="blue"
                   :options="{ choices: ['blue', 'red', 'green'] }"
                   help="`data` carries null: the `default` does not overwrite it." />

            <Field name="quantity" widget="integer" label="Quantity" :options="{ min: 0 }"
                   help="A decimal separator is refused as you type." />

            <Field name="rating" widget="float" label="Rating"
                   help="Six decimals kept, no rounding to two." />

            <Field name="due_date" widget="date" label="Due date"
                   help="Carried as an ISO YYYY-MM-DD string, never shifted by a timezone." />

            <Field name="seen_at" widget="datetime" label="Seen at"
                   help="An instant, carried as an ISO 8601 string: this one DOES have a
                         timezone, and is normalised to UTC when written." />

            <Field name="swatch" widget="color" label="Swatch" :options="{ max: 15 }"
                   help="The value is a palette index; click the selected one again to clear it." />

            <Field name="active" widget="boolean" label="Active" required
                   help="Required, hence radio buttons." />

            <Field name="published" widget="boolean" label="Published"
                   help="Optional, hence a Yes / No / Unset dropdown." />

            <Field name="status" widget="selection" label="Status"
                   :options="{ choices: [
                     { value: 'draft', label: 'Draft' },
                     { value: 'done', label: 'Done' },
                   ] }" />

            <Field name="reference" widget="string" label="Reference" readonly
                   help="Locked, but still present in the payload." />

            <Field name="body" widget="html" label="Body" required
                   :options="{ rows: 8, allowWidget: true,
                               uploadImage: demoUpload, browseImages: demoBrowse }"
                   help="Rich text. Empty out the document and save: the value is null, not
                         '<p></p>', so `required` still catches it. The image button opens a
                         picker over a fake in-memory library." />

            <!-- The same widget WITHOUT allowWidget, on content carrying a
                 marker and a <section>. It must open in source mode with a
                 notice: the schema would otherwise delete both on the first
                 keystroke. -->
            <Field name="legacy_body" widget="html" label="Legacy body"
                   :options="{ rows: 6 }"
                   help="Content the editor cannot represent: it opens as HTML source instead
                         of silently dropping what it does not know." />

            <!-- Purely visual: its value is in no draft and in no payload. The
                 active field is deduced from which of the two below is filled. -->
            <FieldSwitch v-model="targetChoice" :choices="TARGET_CHOICES" :values="data"
                         label="Target"
                         help="Deduced from the values, until you pick a side." />

            <Field v-if="activeTarget === 'target_page'" name="target_page" widget="string"
                   label="Page"
                   help="Switch to Link: this key stays in the draft below, and a payload
                         has to null it on purpose." />

            <Field v-else name="target_link" widget="string" label="Link"
                   :options="{ placeholder: 'https://example.com' }" />

            <p class="note">The draft, live — edited: {{ dirty ? 'yes' : 'no' }}</p>
            <pre class="preview">{{ JSON.stringify(draft, null, 2) }}</pre>
          </Form>
        </template>
      </Card>

      <Card>
        <template #title>Last "save" event</template>
        <template #content>
          <pre v-if="saved" class="preview">{{ JSON.stringify(saved, null, 2) }}</pre>
          <p v-else class="note">Nothing saved yet.</p>

          <template v-if="changed">
            <h3>Only what changed</h3>
            <p class="note">What an update would PATCH.</p>
            <pre class="preview">{{ JSON.stringify(changed, null, 2) }}</pre>
          </template>

          <h3>The original <code>data</code></h3>
          <p class="note">
            It never moves: the form works on a copy.
          </p>
          <pre class="preview">{{ JSON.stringify(data, null, 2) }}</pre>
        </template>
      </Card>

      <Card>
        <template #title>Definition</template>
        <template #content>
          <pre class="preview"><code>{{ DEFINITION }}</code></pre>
        </template>
      </Card>
    </div>
  </section>
</template>

<style scoped>
.preview {
  margin: 0;
  padding: 0.75rem;
  overflow-x: auto;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-bg);
  font-size: 0.8rem;
  line-height: 1.5;
}

h3 {
  margin: 1.5rem 0 0.25rem;
  font-size: 1rem;
}
</style>
