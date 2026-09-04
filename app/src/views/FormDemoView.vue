<script setup lang="ts">
import Card from 'primevue/card'
import { ref } from 'vue'

import type { FormData } from '@/components/form/context'
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
  swatch: 12,
  active: true,
  published: null,
  status: 'draft',
  reference: 'REF-001',
})

const saved = ref<FormData | null>(null)
const changed = ref<FormData | null>(null)

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
  <Field name="swatch"      widget="color"     label="Swatch" :options="{ max: 15 }" />
  <Field name="active"      widget="boolean"   label="Active" required />
  <Field name="published"   widget="boolean"   label="Published" />
  <Field name="status"      widget="selection" label="Status"
         :options="{ choices: [
           { value: 'draft', label: 'Draft' },
           { value: 'done',  label: 'Done' },
         ] }" />
  <Field name="reference"   widget="string"    label="Reference" readonly />
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
