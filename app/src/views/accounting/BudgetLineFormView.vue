<script setup lang="ts">
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { useConfirm } from 'primevue/useconfirm'
import { computed, ref, watch } from 'vue'

import { ApiError } from '@/api/client'
import { can } from '@/auth/permissions'
import type { FormData } from '@/components/form/context'
import Field from '@/components/form/fields/Field.vue'
import type { FieldValue } from '@/components/form/fields/types'
import { toNumberOrNull } from '@/components/form/fields/values'
import Form from '@/components/form/Form.vue'
import { useResourceForm } from '@/composables/useResourceForm'
import {
  createBudgetLine,
  deleteBudgetLine,
  fetchBudgetLine,
  updateBudgetLine,
  type BudgetLineCreatePayload,
  type BudgetLineDetail,
  type BudgetLineUpdatePayload,
} from '@/resources/budgetLines'

/*
 * The budget line form, for both adding and editing, built to sit in a Dialog
 * (no <Card>, no router: see BudgetPositionFormView).
 *
 * The position is a PROP, not a field: a line is added from inside the
 * position it belongs to, so there is nothing to pick. It goes out with the
 * create and never with an update -- the API would let a line move to another
 * position, but no screen offers that yet, and echoing the key would be the
 * kind of untouched-field write the PATCH asymmetry warns about.
 */
const props = defineProps<{
  /** `null` adds. */
  id: string | null
  budgetId: string
  positionId: string
}>()

const emit = defineEmits<{
  saved: [line: BudgetLineDetail, mode: 'create' | 'edit']
  cancel: []
  deleted: []
  /** The heading for whoever frames this form -- here, the Dialog's header. */
  title: [title: string]
}>()

const confirm = useConfirm()

const canDelete = computed(() => can('totem.budget.delete'))

/** `FieldValue` is wider than the payload accepts. */
function text(value: FieldValue): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function createPayload(values: FormData): BudgetLineCreatePayload {
  return {
    name: text(values.name) ?? '',
    position: props.positionId,
    // `required` keeps an empty amount from reaching here.
    planned_amount: toNumberOrNull(values.planned_amount) ?? 0,
    sequence: toNumberOrNull(values.sequence) ?? 10,
  }
}

/** Only the keys <Form> reports as edited reach the PATCH, and never `position`. */
function updatePayload(changed: FormData): BudgetLineUpdatePayload {
  const body: BudgetLineUpdatePayload = {}
  if ('name' in changed) body.name = text(changed.name) ?? ''
  if ('planned_amount' in changed) body.planned_amount = toNumberOrNull(changed.planned_amount) ?? 0
  if ('sequence' in changed) body.sequence = toNumberOrNull(changed.sequence) ?? 10
  return body
}

const form = useResourceForm<BudgetLineDetail>({
  id: () => props.id,
  defaults: { name: null, planned_amount: null, sequence: 10 },
  // The amount arrives as a decimal string; FloatField binds a number.
  toForm: (line) => ({
    name: line.name,
    planned_amount: toNumberOrNull(line.planned_amount),
    sequence: line.sequence,
  }),
  fetchOne: (id, signal) => fetchBudgetLine(props.budgetId, id, signal),
  create: (values) => createBudgetLine(props.budgetId, createPayload(values)),
  update: (id, changed) => updateBudgetLine(props.budgetId, id, updatePayload(changed)),
  notFoundMessage: 'This line no longer exists.',
  onSaved: (line, mode) => emit('saved', line, mode),
})

const { isNew, data, loading, loadError, saving, error, fieldErrors } = form

const title = computed(() =>
  isNew.value ? 'Add a line' : (text(data.value?.name ?? null) ?? 'Line'),
)
const saveLabel = computed(() => (isNew.value ? 'Add' : 'Save'))

watch(title, (value) => emit('title', value), { immediate: true })

const deleting = ref(false)
const deleteError = ref<string | null>(null)

async function remove(): Promise<void> {
  const id = props.id ?? ''
  if (!id) return

  deleting.value = true
  deleteError.value = null
  try {
    await deleteBudgetLine(props.budgetId, id)
    emit('deleted')
  } catch (caught) {
    deleteError.value =
      caught instanceof ApiError ? caught.message : 'This line could not be deleted.'
  } finally {
    deleting.value = false
  }
}

function askDelete(): void {
  confirm.require({
    header: 'Delete this line?',
    message: `“${title.value}” will be removed from the budget.`,
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
      <Button label="Close" size="small" severity="danger" outlined @click="emit('cancel')" />
    </div>
  </Message>

  <Message v-if="deleteError" severity="error" :closable="false" class="page__message">
    {{ deleteError }}
  </Message>

  <Message v-if="error" severity="error" :closable="false" class="page__message">
    {{ error }}
  </Message>

  <template v-if="!loadError">
    <div v-if="loading" class="line-form__skeleton">
      <Skeleton v-for="n in 3" :key="n" height="3.2rem" />
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
          name="name"
          widget="string"
          label="Name"
          required
          :options="{ maxLength: 255, placeholder: 'Rent' }"
        />

        <Field
          name="planned_amount"
          widget="float"
          label="Planned amount"
          required
          :options="{ maxFractionDigits: 2 }"
        />

        <Field
          name="sequence"
          widget="integer"
          label="Sequence"
          required
          help="Ordering among the lines of the category."
        />
      </template>

      <template #actions="{ dirty }">
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
</template>

<style scoped>
.line-form__skeleton {
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
