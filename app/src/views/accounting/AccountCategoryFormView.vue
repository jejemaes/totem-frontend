<script setup lang="ts">
import Button from 'primevue/button'
import Card from 'primevue/card'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { useConfirm } from 'primevue/useconfirm'
import { computed, ref, watch } from 'vue'

import { ApiError } from '@/api/client'
import { can } from '@/auth/permissions'
import { MAX_COLOR_INDEX } from '@/components/colors'
import type { FormData } from '@/components/form/context'
import Field from '@/components/form/fields/Field.vue'
import type { FieldValue } from '@/components/form/fields/types'
import { toNumberOrNull } from '@/components/form/fields/values'
import Form from '@/components/form/Form.vue'
import { useResourceForm } from '@/composables/useResourceForm'
import {
  createAccountCategory,
  deleteAccountCategory,
  fetchAccountCategory,
  updateAccountCategory,
  type AccountCategoryCreatePayload,
  type AccountCategoryDetail,
  type AccountCategoryUpdatePayload,
} from '@/resources/accountCategories'
import { displayAccount, searchAccounts, type AccountRef } from '@/resources/accounts'

/*
 * The accounting category form, for both creating and editing, and with NO
 * router.
 *
 * The owning account is chosen ONCE: the update schema has no `account`, so on
 * an existing category the field turns readonly and updatePayload never names
 * it. Leaving it editable would let the user "move" a category, see Save
 * succeed, and find it back where it was.
 */
const props = defineProps<{
  /** `null` creates. A prop rather than the route param, so a modal can drive it. */
  id: string | null
}>()

const emit = defineEmits<{
  saved: [category: AccountCategoryDetail, mode: 'create' | 'edit']
  /** Cancel, or "Back" after a failed load: the caller decides where that goes. */
  cancel: []
  /** The record is gone: the caller decides where that leaves the user. */
  deleted: []
  /** The heading for whoever frames this form -- a page's <h1>, a Dialog's header. */
  title: [title: string]
}>()

const confirm = useConfirm()

const canDelete = computed(() => can('totem.accountcategory.delete'))

/** `FieldValue` is wider than the payload accepts. */
function text(value: FieldValue): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * A palette index, clamped to what both sides accept: the backend enforces
 * 0..15 with a check constraint. See ContactTagFormView.
 */
function colorIndex(value: FieldValue): number {
  const parsed = toNumberOrNull(value) ?? 0
  return Math.min(Math.max(0, Math.trunc(parsed)), MAX_COLOR_INDEX)
}

/**
 * The owner of the loaded record, nested: the draft only carries its id, so
 * the label has to come from the record. Re-seeded through `onLoaded`.
 */
const account = ref<AccountRef | null>(null)

function createPayload(values: FormData): AccountCategoryCreatePayload {
  return {
    name: text(values.name) ?? '',
    color: colorIndex(values.color),
    account: text(values.account),
  }
}

/** Only the keys <Form> reports as edited reach the PATCH, and never `account`. */
function updatePayload(changed: FormData): AccountCategoryUpdatePayload {
  const body: AccountCategoryUpdatePayload = {}
  if ('name' in changed) body.name = text(changed.name) ?? ''
  if ('color' in changed) body.color = colorIndex(changed.color)
  return body
}

const form = useResourceForm<AccountCategoryDetail>({
  // A getter: the routed page reuses this component when only the param
  // changes, and the prop follows it.
  id: () => props.id,
  // The model's own default colour; `null` is not a legal one.
  defaults: { name: null, color: 0, account: null },
  toForm: (category) => ({
    name: category.name,
    color: category.color,
    account: category.account?.id ?? null,
  }),
  fetchOne: fetchAccountCategory,
  onLoaded: (category) => {
    account.value = category?.account ?? null
  },
  create: (values) => createAccountCategory(createPayload(values)),
  update: (id, changed) => updateAccountCategory(id, updatePayload(changed)),
  notFoundMessage: 'This category no longer exists.',
  onSaved: (category, mode) => emit('saved', category, mode),
})

const { isNew, data, loading, loadError, saving, error, fieldErrors } = form

const title = computed(() =>
  isNew.value ? 'New category' : (text(data.value?.name ?? null) ?? 'Category'),
)
const saveLabel = computed(() => (isNew.value ? 'Create' : 'Save'))

watch(title, (value) => emit('title', value), { immediate: true })

const deleting = ref(false)
const deleteError = ref<string | null>(null)

async function remove(): Promise<void> {
  const id = props.id ?? ''
  if (!id) return

  deleting.value = true
  deleteError.value = null
  try {
    await deleteAccountCategory(id)
    emit('deleted')
  } catch (caught) {
    deleteError.value =
      caught instanceof ApiError ? caught.message : 'This category could not be deleted.'
  } finally {
    deleting.value = false
  }
}

function askDelete(): void {
  confirm.require({
    header: 'Delete this category?',
    message: `“${title.value}” will be removed. Its movements are kept, uncategorised.`,
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

  <Card v-if="!loadError" class="category-form">
    <template #content>
      <div v-if="loading" class="category-form__skeleton">
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
          <!-- Unique among the general categories, or among one account's
               own: a duplicate comes back as a field error, shown in place. -->
          <Field
            name="name"
            widget="string"
            label="Name"
            required
            :options="{ maxLength: 100, placeholder: 'Rent' }"
          />

          <!-- An index into the shared palette: `max` mirrors the backend's
               check constraint. -->
          <Field
            name="color"
            widget="color"
            label="Colour"
            required
            :options="{ max: MAX_COLOR_INDEX }"
          />

          <Field
            name="account"
            widget="many2one"
            label="Account"
            :readonly="!isNew"
            :options="{
              fetch: searchAccounts,
              record: account,
              relationDisplay: displayAccount,
              permission: 'totem.account.read',
            }"
            :help="
              isNew
                ? 'Leave empty for a general category, usable on every account.'
                : 'Set at creation, it cannot be changed.'
            "
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
/* A full-width form is unreadable: the fields themselves are short. */
.category-form {
  max-width: 36rem;
}

.category-form__skeleton {
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
