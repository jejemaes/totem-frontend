<script setup lang="ts">
/*
 * <FormView> and its record actions run against an in-memory record, for
 * /form-demo.
 *
 * Offline like the rest of that page: `useResourceForm` takes callbacks, so a
 * fake store with a delay exercises the whole form -- the skeleton, a save
 * re-seeding it, and the actions column: shown or hidden by the STORED
 * `state` (never a <Field> here, which is the point), disabled while the form
 * is dirty, busy while one runs, a confirmation, a refusal in the banner, a
 * re-seed from an answered record or a reload, and "Preview" which does
 * neither. The fields are laid out by <FormColumns> and two titled
 * <FieldGroup>s, which collapse into one column when the form gets narrow.
 */
import ToggleSwitch from 'primevue/toggleswitch'
import { computed, ref } from 'vue'

import { ApiError, NON_FIELD } from '@/api/client'
import type { RecordAction } from '@/components/actions/actions'
import type { FormData } from '@/components/form/context'
import FieldGroup from '@/components/form/FieldGroup.vue'
import Field from '@/components/form/fields/Field.vue'
import FormColumns from '@/components/form/FormColumns.vue'
import FormView from '@/components/form/FormView.vue'
import { useResourceForm } from '@/composables/useResourceForm'

type DemoPage = {
  id: string
  name: string
  slug: string
  summary: string | null
  state: 'draft' | 'published' | 'archived'
}

const STORED = ref<DemoPage>({
  id: 'page-1',
  name: 'About us',
  slug: 'about-us',
  summary: 'Who we are.',
  state: 'draft',
})

const failNext = ref(false)
const lastAction = ref<string | null>(null)

/** The store's answer after a delay, as a copy: the form must not share it. */
function later<T>(value: () => T, ms = 400): Promise<T> {
  return new Promise((resolve, reject) =>
    setTimeout(() => {
      if (failNext.value) {
        failNext.value = false
        reject(new ApiError('Validation error.', 422, { [NON_FIELD]: 'The demo store refused.' }))
        return
      }
      try {
        resolve(value())
      } catch (caught) {
        reject(caught)
      }
    }, ms),
  )
}

function setState(state: DemoPage['state']): Promise<DemoPage> {
  return later(() => {
    STORED.value = { ...STORED.value, state }
    lastAction.value = `state → ${state}`
    return { ...STORED.value }
  })
}

const ACTIONS: RecordAction<DemoPage>[] = [
  {
    key: 'publish',
    label: 'Publish',
    icon: 'pi pi-send',
    severity: 'success',
    condition: (page) => page.state === 'draft',
    // Answers the record: the form re-seeds from it, no reload.
    run: () => setState('published'),
  },
  {
    key: 'unpublish',
    label: 'Back to draft',
    icon: 'pi pi-undo',
    condition: (page) => page.state === 'published',
    run: () => setState('draft'),
  },
  {
    key: 'archive',
    label: 'Archive',
    icon: 'pi pi-inbox',
    condition: (page) => page.state !== 'archived',
    confirm: { header: 'Archive this page?', message: 'It leaves the website.' },
    // Answers nothing, so it asks for a reload instead.
    reload: true,
    run: async () => {
      await setState('archived')
    },
  },
  {
    key: 'preview',
    label: 'Preview',
    icon: 'pi pi-eye',
    // Changes nothing: no reload, no skeleton.
    run: ([page]) => void (lastAction.value = `preview of ${page.name}`),
  },
  {
    key: 'restore',
    label: 'Restore',
    icon: 'pi pi-replay',
    condition: (page) => page.state === 'archived',
    run: () => setState('draft'),
  },
]

const form = useResourceForm<DemoPage>({
  id: 'page-1',
  defaults: { name: null, slug: null, summary: null },
  toForm: (page) => ({ name: page.name, slug: page.slug, summary: page.summary }),
  fetchOne: () => later(() => ({ ...STORED.value })),
  create: () => Promise.reject(new Error('unreachable')),
  update: (_id, changed: FormData) =>
    later(() => {
      STORED.value = { ...STORED.value, ...(changed as Partial<DemoPage>) }
      return { ...STORED.value }
    }),
})

const state = computed(() => form.record.value?.state ?? '…')
</script>

<template>
  <div class="form-view-demo">
    <label class="form-view-demo__switch">
      <ToggleSwitch v-model="failNext" />
      Fail the next request
    </label>

    <FormView :form="form" title="About us" :skeleton="2" :actions="ACTIONS"
              :cancellable="false">
      <FormColumns>
        <FieldGroup title="Page">
          <Field name="name" widget="string" label="Name" required />
          <Field name="slug" widget="string" label="Slug" required />
        </FieldGroup>
        <FieldGroup title="Content">
          <Field name="summary" widget="text" label="Summary" :options="{ rows: 4 }" />
        </FieldGroup>
      </FormColumns>
    </FormView>

    <p class="form-view-demo__status">
      Stored state: <strong>{{ state }}</strong>
      <span v-if="lastAction"> · last action: {{ lastAction }}</span>
    </p>
  </div>
</template>

<style scoped>
.form-view-demo {
  display: grid;
  gap: 0.75rem;
}

.form-view-demo__switch {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.form-view-demo__status {
  margin: 0;
  color: var(--app-muted);
}
</style>
