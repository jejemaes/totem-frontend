<script setup lang="ts">
import Tab from 'primevue/tab'
import TabList from 'primevue/tablist'
import TabPanel from 'primevue/tabpanel'
import TabPanels from 'primevue/tabpanels'
import Tabs from 'primevue/tabs'
import Tag from 'primevue/tag'
import { computed, ref, watch } from 'vue'

import type { FormData } from '@/components/form/context'
import Field from '@/components/form/fields/Field.vue'
import type { RelationFetch } from '@/components/form/fields/many2one'
import type { FieldValue } from '@/components/form/fields/types'
import { toNumberOrNull } from '@/components/form/fields/values'
import FieldGroup from '@/components/form/FieldGroup.vue'
import FormColumns from '@/components/form/FormColumns.vue'
import FormView from '@/components/form/FormView.vue'
import FileInputWidget from '@/components/form/widget/FileInputWidget.vue'
import { useResourceForm } from '@/composables/useResourceForm'
import {
  searchApplicableCategories,
  type AccountCategoryRef,
} from '@/resources/accountCategories'
import { displayAccount, searchAccounts, type AccountRef } from '@/resources/accounts'
import { displayContact, searchContacts, type ContactRef } from '@/resources/contacts'
import type { CurrencyCode } from '@/resources/currencies'
import {
  createInvoice,
  deleteInvoice,
  fetchInvoice,
  fetchInvoiceDefaults,
  INVOICE_FILE_ACCEPT,
  INVOICE_MAX_UPLOAD_BYTES,
  invoicePaymentStatusLabel,
  invoicePaymentStatusSeverity,
  updateInvoice,
  type InvoiceCreatePayload,
  type InvoiceDetail,
  type InvoiceUpdatePayload,
} from '@/resources/invoices'

import InvoicePaymentListView from './InvoicePaymentListView.vue'

/*
 * The invoice form, for both creating and editing, and with NO router: the
 * record comes in as the `id` prop and every way out is an event.
 *
 * The FILE is not a field: a `File` is not a FieldValue, so it lives in the
 * detached FileInputWidget, and this view owns what <Form> would have done for
 * it -- exactly as DocumentFormView does: the value (`file`), its reset on
 * every record change (`onLoaded`), its dirtiness (`hasExternalChanges`) and
 * the backend's errors on `file_content` (`fileError`). Picked on a create
 * only: the update schema has no file. Optional, unlike a document's.
 *
 * The number, the paid amounts and the status are the backend's: shown
 * read-only on an existing invoice, named by no payload builder.
 *
 * The CATEGORY is narrowed to the account PICKED IN THE DRAFT, through
 * `applicable_to` -- general, or that account's own: the backend refuses
 * another account's. The account is the draft's, not the record's, so the list
 * follows a change of account before any save; the <Field> is keyed on it, and
 * remounts with an empty candidate list -- ManyToOneField loads once per mount,
 * and would otherwise keep offering the previous account's categories. A
 * category left over from the previous account is not cleared here: the draft
 * is <Form>'s, and the backend names the conflict on `category`.
 *
 * The CURRENCY has no <Field>: it is not for the user to pick here. It still
 * rides in the draft -- <Form> copies the whole of `data`, declared or not --
 * which is what the monetary fields read their symbol from
 * (`currencyField`), and what a create sends: the backend's default from
 * `default-values/`, else EUR. Never in `changed`, so never in a PATCH.
 *
 * Three tabs close the form: the PAYMENTS of an existing invoice
 * (InvoicePaymentListView, absent on a create -- nothing to pay yet), the
 * description, and the stored FILE, drawn by the `file_viewer` widget from
 * `file_content` and `file_mimetype` -- in the draft for it, sent by no
 * payload builder. Its PDF viewer waits for a width before fetching, so the
 * hidden panel downloads nothing. NOT lazy, as on DocumentFormView: a lazy
 * TabPanel would unmount the description's <Field>, which would drop out of
 * `values` while the payments show. A payment written there moves the paid amounts and the
 * status: the invoice is fetched again and swapped in through `form.replace`
 * -- no skeleton -- which the list allows only on a clean form.
 */
const props = defineProps<{
  /** `null` creates. A prop rather than the route param, so a modal can drive it. */
  id: string | null
}>()

const emit = defineEmits<{
  saved: [invoice: InvoiceDetail, mode: 'create' | 'edit']
  /** Cancel, or "Back" after a failed load: the caller decides where that goes. */
  cancel: []
  /** The record is gone: the caller decides where that leaves the user. */
  deleted: []
  /** The heading for whoever frames this form -- a page's <h1>, a Dialog's header. */
  title: [title: string]
}>()

/** `FieldValue` is wider than the payload accepts; `''` is no value. */
function text(value: FieldValue): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/** `required` keeps an empty amount from reaching here; 0 is the backend's to refuse. */
function amount(value: FieldValue): number {
  return toNumberOrNull(value) ?? 0
}

function currency(value: FieldValue): CurrencyCode | null {
  return text(value) as CurrencyCode | null
}

/**
 * The record as loaded, for what the draft does not carry: the payment
 * status, and whether a file was stored. Null on a create.
 */
const record = ref<InvoiceDetail | null>(null)

/** The nested relations, labelling the many2ones: see ContactFormView. */
const contact = ref<ContactRef | null>(null)
const account = ref<AccountRef | null>(null)
const category = ref<AccountCategoryRef | null>(null)

/**
 * The category loader of one account, built once per account: see the header.
 * Null without an account -- the field is then readonly, since every category
 * offered could turn out to belong to the account picked next.
 */
const CATEGORY_HELP =
  'Files the movements its payments book. The general categories, and the account’s own.'

const categoryLoaders = new Map<string, RelationFetch>()
function categoriesOf(accountId: FieldValue): RelationFetch | undefined {
  if (typeof accountId !== 'string' || accountId === '') return undefined
  let loader = categoryLoaders.get(accountId)
  if (!loader) {
    loader = searchApplicableCategories(accountId)
    categoryLoaders.set(accountId, loader)
  }
  return loader
}

/** The file to upload, owned here: see the header. */
const file = ref<File | null>(null)

/** Built key by key, never by copying the draft. */
function createPayload(values: FormData): InvoiceCreatePayload {
  return {
    contact: text(values.contact) ?? '',
    account: text(values.account) ?? '',
    category: text(values.category),
    date: text(values.date) ?? '',
    amount_total: amount(values.amount_total),
    name: text(values.name),
    reference: text(values.reference),
    due_date: text(values.due_date),
    description: text(values.description),
    currency_code: currency(values.currency_code),
  }
}

/** Only the keys <Form> reports as edited reach the PATCH. */
function updatePayload(changed: FormData): InvoiceUpdatePayload {
  const body: InvoiceUpdatePayload = {}
  if ('contact' in changed) body.contact = text(changed.contact) ?? ''
  if ('account' in changed) body.account = text(changed.account) ?? ''
  if ('category' in changed) body.category = text(changed.category)
  if ('date' in changed) body.date = text(changed.date) ?? ''
  if ('amount_total' in changed) body.amount_total = amount(changed.amount_total)
  if ('name' in changed) body.name = text(changed.name)
  if ('reference' in changed) body.reference = text(changed.reference)
  if ('due_date' in changed) body.due_date = text(changed.due_date)
  if ('description' in changed) body.description = text(changed.description)
  return body
}

const form = useResourceForm<InvoiceDetail>({
  // A getter: the routed page reuses this component when only the param
  // changes, and the prop follows it.
  id: () => props.id,
  // The read-only keys too: they are <Field readonly>s, never edited, so
  // never in `changed`. `currency_code` falls back to the model's default
  // when the default-values request fails.
  defaults: {
    number: null,
    name: null,
    reference: null,
    date: null,
    due_date: null,
    contact: null,
    account: null,
    category: null,
    amount_total: null,
    currency_code: 'EUR',
    description: null,
    amount_paid: null,
    amount_residual: null,
    file_content: null,
    file_mimetype: null,
  },
  // The amounts arrive as decimal strings; FloatField binds a number.
  toForm: (invoice) => ({
    number: invoice.number,
    name: invoice.name,
    reference: invoice.reference,
    date: invoice.date,
    due_date: invoice.due_date,
    contact: invoice.contact?.id ?? null,
    account: invoice.account?.id ?? null,
    category: invoice.category?.id ?? null,
    amount_total: toNumberOrNull(invoice.amount_total),
    currency_code: invoice.currency_code,
    description: invoice.description,
    amount_paid: toNumberOrNull(invoice.amount_paid),
    amount_residual: toNumberOrNull(invoice.amount_residual),
    // Shown by the File tab's viewer; named by no payload builder.
    file_content: invoice.file_content,
    file_mimetype: invoice.file_mimetype,
  }),
  fetchOne: fetchInvoice,
  fetchDefaults: fetchInvoiceDefaults,
  onLoaded: (loaded) => {
    // A create gets its defaults here, a PARTIAL record: no `id`.
    record.value = loaded && 'id' in loaded && loaded.id ? (loaded as InvoiceDetail) : null
    contact.value = loaded?.contact ?? null
    account.value = loaded?.account ?? null
    category.value = loaded?.category ?? null
    file.value = null
  },
  hasExternalChanges: () => file.value !== null,
  create: (values) => createInvoice(createPayload(values), file.value),
  update: (id, changed) => updateInvoice(id, updatePayload(changed)),
  notFoundMessage: 'This invoice no longer exists.',
  onSaved: (invoice, mode) => emit('saved', invoice, mode),
  // Refused while the invoice has payments or movements (`PROTECT`). The
  // refusal is shown as-is: the backend names the reason better.
  remove: (id) => deleteInvoice(id),
  onDeleted: () => emit('deleted'),
  deleteErrorMessage: 'This invoice could not be deleted.',
})

const { isNew, data, saving } = form

/** The payments on an invoice that has some to show, the description otherwise. */
const tab = ref(props.id ? 'payments' : 'description')
watch(isNew, (creating) => {
  tab.value = creating ? 'description' : 'payments'
})

/**
 * A payment was written: the paid amounts and the status are the backend's,
 * so the invoice is read again. Its failure leaves the old totals on screen;
 * the next load corrects them.
 */
async function refreshTotals(): Promise<void> {
  if (!props.id) return
  try {
    form.replace(await fetchInvoice(props.id))
  } catch {
    // Stale totals beat a load error over a form that is otherwise fine.
  }
}

/**
 * The File tab, on an invoice stored WITH a file -- the record's, not the
 * draft's, though both agree: the key is never edited.
 */
const hasFile = computed(() => !isNew.value && Boolean(record.value?.file_content))

/** The backend's refusal of the file, or the widget's own. */
const fileError = computed(() => form.fieldErrors.value.file_content)

const title = computed(() => {
  if (isNew.value) return 'New invoice'
  const number = text(data.value?.number ?? null)
  const name = text(data.value?.name ?? null)
  if (number && name) return `${number} · ${name}`
  return number ?? name ?? 'Invoice'
})
</script>

<template>
  <FormView
    :form="form"
    :title="title"
    :skeleton="6"
    delete-permission="totem.invoice.delete"
    delete-header="Delete this invoice?"
    :delete-message="`“${title}” will be deleted, with its file.`"
    @cancel="emit('cancel')"
    @title="emit('title', $event)"
  >
    <template #default="{ draft, dirty }">
      <div v-if="record?.payment_status" class="invoice-form__status">
        <Tag
          :value="invoicePaymentStatusLabel(record.payment_status)"
          :severity="invoicePaymentStatusSeverity(record.payment_status)"
        />
      </div>

      <Field
        name="name"
        widget="string"
        label="Name"
        :options="{ maxLength: 255, placeholder: 'Office rent, October' }"
        help="Your own label for the invoice."
      />

      <FormColumns>
        <FieldGroup>
          <Field
            name="contact"
            widget="many2one"
            label="Supplier"
            required
            help="The contact who issued the invoice."
            :options="{
              fetch: searchContacts,
              record: contact,
              relationDisplay: displayContact,
              permission: 'totem.contact.read',
            }"
          />

          <Field
            name="reference"
            widget="string"
            label="Supplier reference"
            :options="{ maxLength: 100 }"
            help="The number the supplier gave the invoice."
          />

          <Field
            name="account"
            widget="many2one"
            label="Account"
            required
            help="The account its payments are booked on."
            :options="{
              fetch: searchAccounts,
              record: account,
              relationDisplay: displayAccount,
              permission: 'totem.account.read',
            }"
          />

          <Field
            :key="String(draft.account ?? '')"
            name="category"
            widget="many2one"
            label="Category"
            :readonly="!draft.account"
            :help="draft.account ? CATEGORY_HELP : 'Pick the account first.'"
            :options="{
              fetch: categoriesOf(draft.account),
              record: category,
              permission: 'totem.accountcategory.read',
            }"
          />
        </FieldGroup>

        <FieldGroup>
          <!-- Assigned by the backend at creation, from the year of the date. -->
          <Field v-if="!isNew" name="number" widget="string" label="Number" readonly />

          <Field
            name="date"
            widget="date"
            label="Date"
            required
            help="The date on the invoice. Never in the future."
          />

          <Field name="due_date" widget="date" label="Due date" />
        </FieldGroup>

        <FieldGroup>
          <!-- Written in the record's currency, drawn as its symbol.
               Positive: the backend refuses zero and below. -->
          <Field
            name="amount_total"
            widget="monetary"
            label="Total amount"
            required
            :options="{ currencyField: 'currency_code' }"
          />

        </FieldGroup>

        <!-- Computed by the backend from the done payments: shown, never sent. -->
        <FieldGroup v-if="!isNew">
          <Field
            name="amount_paid"
            widget="monetary"
            label="Amount paid"
            readonly
            :options="{ currencyField: 'currency_code' }"
            help="The sum of the done payments."
          />
          <Field
            name="amount_residual"
            widget="monetary"
            label="Amount due"
            readonly
            :options="{ currencyField: 'currency_code' }"
          />
        </FieldGroup>
      </FormColumns>

      <FileInputWidget
        v-if="isNew"
        v-model="file"
        label="File"
        :accept="INVOICE_FILE_ACCEPT"
        :max-bytes="INVOICE_MAX_UPLOAD_BYTES"
        :error="fileError"
        :readonly="saving"
        help="The original invoice, a PDF or an image of 20 MB at most. It cannot be replaced afterwards."
      />


      <Tabs v-model:value="tab" class="invoice-form__tabs">
        <TabList>
          <Tab v-if="!isNew" value="payments">Payments</Tab>
          <Tab value="description">Description</Tab>
          <Tab v-if="hasFile" value="file">File</Tab>
        </TabList>
        <TabPanels>
          <TabPanel v-if="!isNew && id" value="payments">
            <InvoicePaymentListView
              :invoice-id="id"
              :currency-code="(data?.currency_code as CurrencyCode | null) ?? null"
              :residual="record?.amount_residual ?? null"
              :disabled="dirty"
              @changed="refreshTotals"
            />
          </TabPanel>
          <TabPanel value="description">
            <Field name="description" widget="text" :options="{ rows: 6 }" />
          </TabPanel>
          <!-- An existing file is fixed: shown, never replaced. -->
          <TabPanel v-if="hasFile" value="file">
            <Field
              name="file_content"
              widget="file_viewer"
              :options="{ mimetypeField: 'file_mimetype' }"
            />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </template>
  </FormView>
</template>

<style scoped>
.invoice-form__status {
  display: flex;
  justify-content: flex-end;
}

/* The panel's own padding sits flush with the fields above. */
.invoice-form__tabs :deep(.p-tabpanels) {
  padding: 1rem 0 0;
}
</style>
