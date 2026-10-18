<script setup lang="ts">
import Button from 'primevue/button'
import Card from 'primevue/card'
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
  createAccount,
  deleteAccount,
  fetchAccount,
  updateAccount,
  type AccountCreatePayload,
  type AccountDetail,
  type AccountUpdatePayload,
} from '@/resources/accounts'

/*
 * The account form, for both creating and editing, and with NO router: the
 * record comes in as the `id` prop and every way out is an event.
 *
 * The three totals are shown read-only on an existing account. They sit in the
 * draft like any field, but a readonly field can never be edited, so they
 * never reach `changed` -- and the payload builders do not name them anyway:
 * neither schema accepts them.
 */
const props = defineProps<{
  /** `null` creates. A prop rather than the route param, so a modal can drive it. */
  id: string | null
}>()

const emit = defineEmits<{
  saved: [account: AccountDetail, mode: 'create' | 'edit']
  /** Cancel, or "Back" after a failed load: the caller decides where that goes. */
  cancel: []
  /** The record is gone: the caller decides where that leaves the user. */
  deleted: []
  /** The heading for whoever frames this form -- a page's <h1>, a Dialog's header. */
  title: [title: string]
}>()

const confirm = useConfirm()

const canDelete = computed(() => can('totem.account.delete'))

/** `FieldValue` is wider than the payload accepts. */
function text(value: FieldValue): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * The code, upper-cased on the way out.
 *
 * The backend's pattern is `^[A-Z0-9_-]{1,50}$` and it REFUSES lower case
 * rather than folding it, so `bank` would come back as a 422 the user then
 * has to fix by retyping. Folding here is lossless -- no two valid codes differ
 * by case alone -- and anything else invalid is still left to the backend to
 * name.
 */
function code(value: FieldValue): string {
  return (text(value) ?? '').trim().toUpperCase()
}

function createPayload(values: FormData): AccountCreatePayload {
  return {
    code: code(values.code),
    name: text(values.name) ?? '',
    description: text(values.description),
    active: values.active === true,
  }
}

/** Only the keys <Form> reports as edited reach the PATCH. */
function updatePayload(changed: FormData): AccountUpdatePayload {
  const body: AccountUpdatePayload = {}
  if ('code' in changed) body.code = code(changed.code)
  if ('name' in changed) body.name = text(changed.name) ?? ''
  if ('description' in changed) body.description = text(changed.description)
  if ('active' in changed) body.active = changed.active === true
  return body
}

const form = useResourceForm<AccountDetail>({
  // A getter: the routed page reuses this component when only the param
  // changes, and the prop follows it.
  id: () => props.id,
  // `active` starts true, the model's own default: a new account is meant to
  // be used.
  defaults: { code: null, name: null, description: null, active: true },
  // The totals arrive as decimal strings; FloatField binds a number.
  toForm: (account) => ({
    code: account.code,
    name: account.name,
    description: account.description,
    active: account.active,
    total_debit: toNumberOrNull(account.total_debit),
    total_credit: toNumberOrNull(account.total_credit),
    balance: toNumberOrNull(account.balance),
  }),
  fetchOne: fetchAccount,
  create: (values) => createAccount(createPayload(values)),
  update: (id, changed) => updateAccount(id, updatePayload(changed)),
  notFoundMessage: 'This account no longer exists.',
  onSaved: (account, mode) => emit('saved', account, mode),
})

const { isNew, data, loading, loadError, saving, error, fieldErrors } = form

const title = computed(() => {
  if (isNew.value) return 'New account'
  const name = text(data.value?.name ?? null)
  const accountCode = text(data.value?.code ?? null)
  if (accountCode && name) return `${accountCode} · ${name}`
  return name ?? 'Account'
})
const saveLabel = computed(() => (isNew.value ? 'Create' : 'Save'))

watch(title, (value) => emit('title', value), { immediate: true })

const deleting = ref(false)
const deleteError = ref<string | null>(null)

/**
 * An account holding movements cannot be removed (`on_delete=PROTECT`). The
 * refusal is shown as-is: the backend names the reason better.
 */
async function remove(): Promise<void> {
  const id = props.id ?? ''
  if (!id) return

  deleting.value = true
  deleteError.value = null
  try {
    await deleteAccount(id)
    emit('deleted')
  } catch (caught) {
    deleteError.value =
      caught instanceof ApiError ? caught.message : 'This account could not be deleted.'
  } finally {
    deleting.value = false
  }
}

function askDelete(): void {
  confirm.require({
    header: 'Delete this account?',
    message: `“${title.value}” and its own categories will be removed.`,
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

  <Card v-if="!loadError" class="account-form">
    <template #content>
      <div v-if="loading" class="account-form__skeleton">
        <Skeleton v-for="n in 4" :key="n" height="3.2rem" />
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
            name="code"
            widget="string"
            label="Code"
            required
            :options="{ maxLength: 50, placeholder: 'BANK-MAIN' }"
            help="Upper case letters, digits, '_' and '-' only."
          />

          <!-- Unique: a duplicate comes back as a field error, shown in place. -->
          <Field
            name="name"
            widget="string"
            label="Name"
            required
            :options="{ maxLength: 255, placeholder: 'Main bank account' }"
          />

          <Field name="description" widget="text" label="Description" />

          <Field
            name="active"
            widget="boolean"
            label="Active"
            required
            help="An archived account keeps its movements."
          />

          <!-- Computed by the backend from the movements: shown, never sent. -->
          <template v-if="!isNew">
            <Field
              name="total_debit"
              widget="float"
              label="Total debit"
              readonly
              :options="{ maxFractionDigits: 2 }"
              help="The sum of the expenses."
            />
            <Field
              name="total_credit"
              widget="float"
              label="Total credit"
              readonly
              :options="{ maxFractionDigits: 2 }"
              help="The sum of the revenues."
            />
            <Field
              name="balance"
              widget="float"
              label="Balance"
              readonly
              :options="{ maxFractionDigits: 2 }"
              help="The sum of every movement."
            />
          </template>
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
.account-form {
  max-width: 36rem;
}

.account-form__skeleton {
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
