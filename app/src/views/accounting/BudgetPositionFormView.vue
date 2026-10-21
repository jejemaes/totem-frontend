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
  searchApplicableCategories,
  type AccountCategoryRef,
} from '@/resources/accountCategories'
import {
  createBudgetPosition,
  deleteBudgetPosition,
  fetchBudgetPosition,
  updateBudgetPosition,
  type BudgetPositionCreatePayload,
  type BudgetPositionDetail,
  type BudgetPositionUpdatePayload,
} from '@/resources/budgetPositions'

/*
 * The position form -- a category of a budget -- for both adding and editing.
 *
 * Built to sit in a Dialog, which is why it renders no <Card>: the Dialog is
 * the frame, and a card inside a modal is a box in a box. Like every view it
 * has no router; its host closes the Dialog on `saved`, `cancel` and
 * `deleted`, and shows `title` as the header.
 *
 * The category dropdown is narrowed to the budget's account (`applicable_to`):
 * the backend refuses any other category, and the unique constraint refuses a
 * category the budget already has -- that one is left to the backend, whose
 * field error <Form> shows in place.
 */
const props = defineProps<{
  /** `null` adds. */
  id: string | null
  budgetId: string
  /** The budget's account: it decides which categories are allowed. */
  accountId: string
}>()

const emit = defineEmits<{
  saved: [position: BudgetPositionDetail, mode: 'create' | 'edit']
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

const searchCategories = computed(() => searchApplicableCategories(props.accountId))

/** The category of the loaded record, nested: the draft only carries its id. */
const category = ref<AccountCategoryRef | null>(null)

function createPayload(values: FormData): BudgetPositionCreatePayload {
  return {
    category: text(values.category) ?? '',
    sequence: toNumberOrNull(values.sequence) ?? 10,
  }
}

/** Only the keys <Form> reports as edited reach the PATCH. */
function updatePayload(changed: FormData): BudgetPositionUpdatePayload {
  const body: BudgetPositionUpdatePayload = {}
  if ('category' in changed) body.category = text(changed.category) ?? ''
  if ('sequence' in changed) body.sequence = toNumberOrNull(changed.sequence) ?? 10
  return body
}

const form = useResourceForm<BudgetPositionDetail>({
  id: () => props.id,
  // The model's own default sequence, so a create never has to send null.
  defaults: { category: null, sequence: 10 },
  toForm: (position) => ({
    category: position.category?.id ?? null,
    sequence: position.sequence,
  }),
  fetchOne: (id, signal) => fetchBudgetPosition(props.budgetId, id, signal),
  onLoaded: (position) => {
    category.value = position?.category ?? null
  },
  create: (values) => createBudgetPosition(props.budgetId, createPayload(values)),
  update: (id, changed) => updateBudgetPosition(props.budgetId, id, updatePayload(changed)),
  notFoundMessage: 'This category is no longer part of the budget.',
  onSaved: (position, mode) => emit('saved', position, mode),
})

const { isNew, data, loading, loadError, saving, error, fieldErrors } = form

const title = computed(() => {
  if (isNew.value) return 'Add a category'
  return text(category.value?.name ?? null) ?? 'Category'
})
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
    await deleteBudgetPosition(props.budgetId, id)
    emit('deleted')
  } catch (caught) {
    deleteError.value =
      caught instanceof ApiError ? caught.message : 'This category could not be removed.'
  } finally {
    deleting.value = false
  }
}

function askDelete(): void {
  confirm.require({
    header: 'Remove this category?',
    message: `“${title.value}” will be removed from the budget, with its lines.`,
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary', text: true },
    acceptProps: { label: 'Remove', severity: 'danger' },
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
    <div v-if="loading" class="position-form__skeleton">
      <Skeleton v-for="n in 2" :key="n" height="3.2rem" />
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
          name="category"
          widget="many2one"
          label="Category"
          required
          :options="{
            fetch: searchCategories,
            record: category,
            permission: 'totem.accountcategory.read',
          }"
          help="A general category, or one of the budget's account."
        />

        <Field
          name="sequence"
          widget="integer"
          label="Sequence"
          required
          help="Ordering among the categories of the budget."
        />
      </template>

      <template #actions="{ dirty }">
        <Button
          v-if="!isNew && canDelete"
          label="Remove"
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
.position-form__skeleton {
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
