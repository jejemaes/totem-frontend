<script setup lang="ts">
import Button from 'primevue/button'
import Card from 'primevue/card'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Tab from 'primevue/tab'
import TabList from 'primevue/tablist'
import TabPanel from 'primevue/tabpanel'
import TabPanels from 'primevue/tabpanels'
import Tabs from 'primevue/tabs'
import { useConfirm } from 'primevue/useconfirm'
import { computed, ref, watch } from 'vue'

import { ApiError } from '@/api/client'
import { can } from '@/auth/permissions'
import type { FormData } from '@/components/form/context'
import Field from '@/components/form/fields/Field.vue'
import type { FieldValue } from '@/components/form/fields/types'
import Form from '@/components/form/Form.vue'
import { useResourceForm } from '@/composables/useResourceForm'
import { displayAccount, searchAccounts, type AccountRef } from '@/resources/accounts'
import {
  createBudget,
  deleteBudget,
  fetchBudget,
  updateBudget,
  type BudgetCreatePayload,
  type BudgetDetail,
  type BudgetUpdatePayload,
} from '@/resources/budgets'
import { displayUser, searchUsers, type UserRef } from '@/resources/users'

import BudgetBalanceView from './BudgetBalanceView.vue'

/*
 * The budget form, for both creating and editing, and with NO router. The
 * budget's own fields, plus -- on a saved budget -- a Balance tab reading its
 * positions (BudgetBalanceView). Positions and lines are nested endpoints with
 * their own writes, so that tab holds no <Field>: it is beside the form's data,
 * not part of it, and editing a line there never makes the budget dirty.
 *
 * The account is chosen ONCE: the update schema has no `account`, so on an
 * existing budget the field turns readonly and updatePayload never names it.
 *
 * The note and the dates sit in PrimeVue tabs, deliberately NOT `lazy`: a lazy
 * TabPanel unmounts its hidden content, and an unmounted <Field> unregisters
 * from the form -- the note would then drop out of `values` whenever another
 * tab is showing. Non-lazy panels are only hidden with `v-show`.
 */
const props = defineProps<{
  /** `null` creates. A prop rather than the route param, so a modal can drive it. */
  id: string | null
}>()

const emit = defineEmits<{
  saved: [budget: BudgetDetail, mode: 'create' | 'edit']
  /** Cancel, or "Back" after a failed load: the caller decides where that goes. */
  cancel: []
  /** The record is gone: the caller decides where that leaves the user. */
  deleted: []
  /** The heading for whoever frames this form -- a page's <h1>, a Dialog's header. */
  title: [title: string]
  /**
   * The balance asked for the movements behind a practical amount. Relayed
   * with the account added: the balance knows the category, only this form
   * holds the budget's account -- and neither may navigate.
   */
  movements: [accountId: string, categoryId: string]
}>()

const confirm = useConfirm()

const canDelete = computed(() => can('totem.budget.delete'))

/** `FieldValue` is wider than the payload accepts. */
function text(value: FieldValue): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * The account and the user of the loaded record, nested. The draft only
 * carries their ids, so the labels have to come from the record; re-seeded
 * through `onLoaded`, the one hook that fires when the route param changes
 * under a reused component.
 */
const account = ref<AccountRef | null>(null)
const user = ref<UserRef | null>(null)

function openMovements(categoryId: string): void {
  // The balance only offers the pencil once the account is known.
  if (account.value) emit('movements', account.value.id, categoryId)
}

function createPayload(values: FormData): BudgetCreatePayload {
  return {
    name: text(values.name) ?? '',
    account: text(values.account) ?? '',
    user: text(values.user),
    active: values.active === true,
    // HtmlField already reports an untouched editor as null, never "<p></p>".
    note: text(values.note),
  }
}

/** Only the keys <Form> reports as edited reach the PATCH, and never `account`. */
function updatePayload(changed: FormData): BudgetUpdatePayload {
  const body: BudgetUpdatePayload = {}
  if ('name' in changed) body.name = text(changed.name) ?? ''
  if ('user' in changed) body.user = text(changed.user)
  if ('active' in changed) body.active = changed.active === true
  if ('note' in changed) body.note = text(changed.note)
  return body
}

const form = useResourceForm<BudgetDetail>({
  // A getter: the routed page reuses this component when only the param
  // changes, and the prop follows it.
  id: () => props.id,
  // `active` starts true: the model's own default.
  defaults: {
    name: null,
    account: null,
    user: null,
    active: true,
    note: null,
  },
  toForm: (budget) => ({
    name: budget.name,
    account: budget.account?.id ?? null,
    user: budget.user?.id ?? null,
    active: budget.active,
    note: budget.note,
    create_date: budget.create_date,
    update_date: budget.update_date,
  }),
  fetchOne: fetchBudget,
  onLoaded: (budget) => {
    account.value = budget?.account ?? null
    user.value = budget?.user ?? null
  },
  create: (values) => createBudget(createPayload(values)),
  update: (id, changed) => updateBudget(id, updatePayload(changed)),
  notFoundMessage: 'This budget no longer exists.',
  onSaved: (budget, mode) => emit('saved', budget, mode),
})

const { isNew, data, loading, loadError, saving, error, fieldErrors } = form

/**
 * The open tab. Balance comes first and is what an edit opens on: a saved
 * budget is mostly read for its figures. Balance and Infos only exist on a
 * saved budget, so a create -- including this component being reused from an
 * edit -- opens on Note rather than leaving the tab strip pointing at a tab
 * that is gone; and a create turning into an edit (the page reuses this
 * component after the redirect) moves to Balance.
 */
const tab = ref(isNew.value ? 'note' : 'balance')

/**
 * Whether the Balance tab has been opened on this budget.
 *
 * The panels are NOT lazy (see the header), so a balance mounted with them
 * would fetch every position even on a create turned edit that never shows
 * it. It is mounted on the first visit instead, then KEPT, so going back and
 * forth between tabs does not refetch it.
 */
const balanceSeen = ref(false)
watch(
  tab,
  (value) => {
    if (value === 'balance') balanceSeen.value = true
  },
  { immediate: true },
)

watch(isNew, (creating) => {
  tab.value = creating ? 'note' : 'balance'
  if (creating) balanceSeen.value = false
})

const title = computed(() =>
  isNew.value ? 'New budget' : (text(data.value?.name ?? null) ?? 'Budget'),
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
    await deleteBudget(id)
    emit('deleted')
  } catch (caught) {
    deleteError.value =
      caught instanceof ApiError ? caught.message : 'This budget could not be deleted.'
  } finally {
    deleting.value = false
  }
}

function askDelete(): void {
  confirm.require({
    header: 'Delete this budget?',
    message: `“${title.value}” will be removed, with its positions and lines.`,
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

  <Card v-if="!loadError" class="budget-form">
    <template #content>
      <div v-if="loading" class="budget-form__skeleton">
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
            name="name"
            widget="string"
            label="Name"
            required
            :options="{ maxLength: 255, placeholder: 'Household 2026' }"
          />

          <!-- Two columns of the view's own: a layout concern of this screen,
               not something <Form> should grow. <Field> registers through
               inject, so any wrapper is transparent to it. Read row by row:
               account | active, then user. -->
          <div class="budget-form__columns">
            <Field
              name="account"
              widget="many2one"
              label="Account"
              :required="isNew"
              :readonly="!isNew"
              :options="{
                fetch: searchAccounts,
                record: account,
                relationDisplay: displayAccount,
                permission: 'totem.account.read',
              }"
              :help="isNew ? undefined : 'Set at creation, it cannot be changed.'"
            />

            <Field name="active" widget="boolean" label="Active" required />

            <Field
              name="user"
              widget="many2one"
              label="User"
              :options="{
                fetch: searchUsers,
                record: user,
                relationDisplay: displayUser,
                permission: 'totem.user.read',
              }"
              help="The user in charge of the budget."
            />
          </div>

          <Tabs v-model:value="tab" class="budget-form__tabs">
            <TabList>
              <Tab v-if="!isNew" value="balance">Balance</Tab>
              <Tab value="note">Note</Tab>
              <Tab v-if="!isNew" value="infos">Infos</Tab>
            </TabList>
            <TabPanels>
              <!-- Keyed on the id: the routed page reuses this component when
                   only the param changes, and the balance must follow. -->
              <TabPanel v-if="!isNew" value="balance">
                <BudgetBalanceView
                  v-if="balanceSeen && id"
                  :key="id"
                  :budget-id="id"
                  :account-id="account?.id ?? null"
                  @movements="openMovements"
                />
              </TabPanel>

              <TabPanel value="note">
                <!-- Default options: `allowWidget` stays off, like the
                     backend's HtmlField on this model. -->
                <Field name="note" widget="html" label="Note" :options="{ rows: 8 }" />
              </TabPanel>

              <!-- Shown, never sent: neither schema accepts the dates. -->
              <TabPanel v-if="!isNew" value="infos">
                <div class="budget-form__columns">
                  <Field name="create_date" widget="datetime" label="Created on" readonly />
                  <Field name="update_date" widget="datetime" label="Last updated" readonly />
                </div>
              </TabPanel>
            </TabPanels>
          </Tabs>
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
/* Wider than the other forms: two columns, and a rich-text editor below. */
.budget-form {
  max-width: 56rem;
}

.budget-form__skeleton {
  display: grid;
  gap: 1rem;
}

.budget-form__columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem 2rem;
}

/* One column on a narrow screen: half of a phone is too small for a dropdown. */
@media (max-width: 40rem) {
  .budget-form__columns {
    grid-template-columns: 1fr;
  }
}

/* The panel's own padding sits flush with the fields above. */
.budget-form__tabs :deep(.p-tabpanels) {
  padding: 1rem 0 0;
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
