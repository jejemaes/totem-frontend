<script setup lang="ts">
import { computed, ref } from 'vue'

import type { FormData } from '@/components/form/context'
import FieldGroup from '@/components/form/FieldGroup.vue'
import Field from '@/components/form/fields/Field.vue'
import type { FieldValue } from '@/components/form/fields/types'
import FormColumns from '@/components/form/FormColumns.vue'
import FormView from '@/components/form/FormView.vue'
import { useResourceForm } from '@/composables/useResourceForm'
import { searchContactTags } from '@/resources/contactTags'
import { searchCountries, type CountryRef } from '@/resources/countries'
import {
  createContact,
  displayContact,
  fetchContact,
  fetchContactDefaults,
  searchCompanies,
  updateContact,
  type ContactCreatePayload,
  type ContactDetail,
  type ContactRef,
  type ContactTagRef,
  type ContactUpdatePayload,
} from '@/resources/contacts'

/*
 * The contact form, for both creating and editing, and with NO router: the record
 * comes in as the `id` prop and every way out is an event -- the routed page
 * turns those into navigation, a Dialog into closing itself.
 * `useResourceForm` owns everything that differs -- loading the record, POST
 * versus PATCH, the error mapping -- and <FormView> everything drawn around the
 * fields, so what is left here is the field list and the payloads.
 *
 * Simpler than UserFormView: every value lives in the <Form> draft and there is
 * no detached widget to seed or to diff. The relations are ordinary fields --
 * the country and the parent company hold the id of their row, the tags hold a
 * list of ids, and <Form> diffs the list for us.
 *
 * A contact is a person or a company, and `is_company` -- the switch at the
 * top -- decides which side's fields are shown. The other side's fields are
 * unmounted, not cleared: their values stay in the draft, so switching back and
 * forth loses nothing, and an unmounted <Field> drops its `required`. What
 * reaches the backend is decided by the payloads below, not by what is mounted.
 */
const props = defineProps<{
  /** `null` creates. A prop rather than the route param, so a modal can drive it. */
  id: string | null
}>()

const emit = defineEmits<{
  saved: [contact: ContactDetail, mode: 'create' | 'edit']
  /** Cancel, or "Back" after a failed load: the caller decides where that goes. */
  cancel: []
  /** The heading for whoever frames this form -- a page's <h1>, a Dialog's header. */
  title: [title: string]
}>()

/** `FieldValue` is wider than the payload accepts: these fields only ever
    produce strings, but the type does not say so. */
function text(value: FieldValue): string | null {
  return typeof value === 'string' ? value : null
}

/**
 * The same narrowing for the one list-valued field.
 *
 * The tag ids are ULIDs, so anything that is not a non-empty string is dropped
 * rather than sent -- the payload types them `string[]`.
 */
function ids(value: FieldValue): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((id): id is string => typeof id === 'string' && id !== '')
}

/*
 * Each side's own fields, mirroring `ContactService.PERSON_FIELDS` and
 * `COMPANY_FIELDS` in the backend: a company must hold NULL in every person
 * field and the other way round, or the save is a 422 naming the field.
 */
const PERSON_FIELDS = ['last_name', 'first_name', 'birth_date', 'parent'] as const
const COMPANY_FIELDS = ['name', 'vat'] as const

/*
 * Both payloads are built key by key, never by copying the draft.
 *
 * The relations go out as ids -- `country` as the bare ISO code, `parent` as a
 * contact id, `tags` as the list of tag ids -- which is what the draft holds. A relation is written as
 * the id of its target, never as the nested object the GET returns.
 *
 * What is NOT sent still matters: the backend deserialises with
 * `exclude_unset=True`, so an omitted `tags` LEAVES THE RELATION ALONE while an
 * explicit `[]` clears it. updatePayload below therefore mentions the key only
 * when <Form> reports it as edited -- editing a phone number must not touch the
 * tags.
 */
function createPayload(values: FormData): ContactCreatePayload {
  // Only the shown side's fields: the hidden ones may still hold what was typed
  // before the switch was flipped, and the backend refuses them.
  const side: ContactCreatePayload =
    values.is_company === true
      ? { name: text(values.name), vat: text(values.vat) }
      : {
          last_name: text(values.last_name),
          first_name: text(values.first_name),
          birth_date: text(values.birth_date),
          parent: text(values.parent),
        }
  return {
    is_company: values.is_company === true,
    ...side,
    email: text(values.email),
    mobile: text(values.mobile),
    number: text(values.number),
    street: text(values.street),
    zip: text(values.zip),
    city: text(values.city),
    country: text(values.country),
    tags: ids(values.tags),
  }
}

/**
 * Only the keys <Form> reports as edited reach the PATCH: an untouched field
 * must not be echoed back, and an empty body would be a no-op the backend
 * reports as a 404.
 *
 * The type, on the other hand, may force keys that were NOT edited. The backend
 * reads every absent key from the stored record, so a person turned into a
 * company still has its stored last name -- and is refused -- unless the PATCH
 * nulls it. Changing `is_company` therefore sends `null` for every field of the
 * side being left. And an edit made on the hidden side (typed, then switched
 * back) is dropped, for the same refusal.
 */
function updatePayload(changed: FormData): ContactUpdatePayload {
  const body: ContactUpdatePayload = {}
  // The type the record is saved as: the edited one, or the stored one.
  const isCompany =
    'is_company' in changed ? changed.is_company === true : form.record.value?.is_company === true
  if ('is_company' in changed) {
    body.is_company = isCompany
    for (const key of isCompany ? PERSON_FIELDS : COMPANY_FIELDS) body[key] = null
  }
  if (isCompany) {
    if ('name' in changed) body.name = text(changed.name)
    if ('vat' in changed) body.vat = text(changed.vat)
  } else {
    if ('last_name' in changed) body.last_name = text(changed.last_name)
    if ('first_name' in changed) body.first_name = text(changed.first_name)
    if ('birth_date' in changed) body.birth_date = text(changed.birth_date)
    if ('parent' in changed) body.parent = text(changed.parent)
  }
  if ('email' in changed) body.email = text(changed.email)
  if ('mobile' in changed) body.mobile = text(changed.mobile)
  if ('number' in changed) body.number = text(changed.number)
  if ('street' in changed) body.street = text(changed.street)
  if ('zip' in changed) body.zip = text(changed.zip)
  if ('city' in changed) body.city = text(changed.city)
  if ('country' in changed) body.country = text(changed.country)
  // The guard is the no-wipe guarantee, not a micro-optimisation: an
  // unconditional `body.tags` would clear the relation on every save that did
  // not touch it.
  if ('tags' in changed) body.tags = ids(changed.tags)
  return body
}

/**
 * The country of the loaded record, nested.
 *
 * `data` below is the DRAFT -- it carries the country's id and nothing else --
 * so the label has to come from the record itself. This is what the many2one
 * field displays when it is read-only, and what labels the current value while
 * the dropdown's own list has not landed yet. Re-seeded through `onLoaded`, the
 * only hook that fires when the route param changes under a reused component.
 */
const country = ref<CountryRef | null>(null)

/** The parent company of the loaded record, nested: the same role as `country`. */
const parent = ref<ContactRef | null>(null)

/**
 * The tags of the loaded record, nested.
 *
 * The same role as `country` above, and it carries more weight: the tags field
 * fetches nothing until its dropdown is opened, so these records are the only
 * thing that can paint the chips on a form the user never opens it on. Without
 * them the field would show bare ULIDs.
 */
const tags = ref<ContactTagRef[]>([])

const form = useResourceForm<ContactDetail>({
  // A getter: the routed page reuses this component when only the param
  // changes, and the prop follows it.
  id: () => props.id,
  defaults: {
    // A person, like the backend's own `default=False`.
    is_company: false,
    name: null,
    vat: null,
    last_name: null,
    first_name: null,
    parent: null,
    email: null,
    mobile: null,
    birth_date: null,
    number: null,
    street: null,
    zip: null,
    city: null,
    country: null,
    tags: [],
  },
  // Both relations are flattened to their ids: the draft carries what a PATCH
  // sends, and the nested objects go to the fields' `record`/`records` options
  // instead. `tags` defaults to `[]` and never to `null` -- that is the empty
  // state every list-valued field holds.
  toForm: (contact) => ({
    // `?? false`: the defaults the backend answers are a PARTIAL record.
    is_company: contact.is_company ?? false,
    name: contact.name,
    vat: contact.vat,
    last_name: contact.last_name,
    first_name: contact.first_name,
    parent: contact.parent?.id ?? null,
    email: contact.email,
    mobile: contact.mobile,
    birth_date: contact.birth_date,
    number: contact.number,
    street: contact.street,
    zip: contact.zip,
    city: contact.city,
    country: contact.country?.id ?? null,
    tags: contact.tags?.map((tag) => tag.id) ?? [],
  }),
  fetchOne: fetchContact,
  fetchDefaults: fetchContactDefaults,
  onLoaded: (contact) => {
    country.value = contact?.country ?? null
    parent.value = contact?.parent ?? null
    tags.value = contact?.tags ?? []
  },
  create: (values) => createContact(createPayload(values)),
  update: (id, changed) => updateContact(id, updatePayload(changed)),
  notFoundMessage: 'This contact no longer exists.',
  onSaved: (contact, mode) => emit('saved', contact, mode),
})

const { isNew, data } = form

/** The contact's name titles the page once the record has landed: the stored
    one, like the backend's `display_name`, not the draft being typed. */
const title = computed(() => {
  if (isNew.value) return 'New contact'
  if (data.value?.is_company === true) return text(data.value.name ?? null) ?? 'Company'
  const last = text(data.value?.last_name ?? null)
  if (!last) return 'Contact'
  const first = text(data.value?.first_name ?? null)
  return first ? `${first} ${last}` : last
})
</script>

<template>
  <FormView
    :form="form"
    :title="title"
    :skeleton="8"
    @cancel="emit('cancel')"
    @title="emit('title', $event)"
  >
    <template #default="{ draft }">
      <!-- First: it decides which of the fields below are shown. -->
      <Field
        name="is_company"
        widget="boolean_toggle"
        label="Type"
        :options="{ false_label: 'Person', true_label: 'Company' }"
      />

      <!-- Who, beside how to reach them. -->
      <FormColumns>
        <FieldGroup v-if="draft.is_company">
          <!-- The name is what the backend requires of a company. -->
          <Field
            name="name"
            widget="string"
            label="Name"
            required
            :options="{ maxLength: 255, placeholder: 'Acme' }"
          />

          <Field
            name="vat"
            widget="string"
            label="VAT number"
            :options="{ maxLength: 32, placeholder: 'BE0123456789' }"
          />
        </FieldGroup>

        <FieldGroup v-else>
          <!-- The last name is what the backend requires of a person. -->
          <Field
            name="last_name"
            widget="string"
            label="Last name"
            required
            :options="{ maxLength: 255, placeholder: 'Doe' }"
          />

          <Field
            name="first_name"
            widget="string"
            label="First name"
            :options="{ maxLength: 255, placeholder: 'Jane' }"
          />

          <!-- Companies only: the backend refuses a person as a parent. -->
          <Field
            name="parent"
            widget="many2one"
            label="Company"
            :options="{
              fetch: searchCompanies,
              record: parent,
              relationDisplay: displayContact,
              permission: 'totem.contact.read',
            }"
          />
        </FieldGroup>

        <FieldGroup>
          <Field
            name="email"
            widget="string"
            label="Email"
            :options="{ maxLength: 255, placeholder: 'jane.doe@example.com' }"
          />

          <Field name="mobile" widget="string" label="Mobile" :options="{ maxLength: 32 }" />
        </FieldGroup>
      </FormColumns>

      <!-- One titled group, its fields read row by row: number | street,
           zip | city, then the country. -->
      <FieldGroup title="Address">
        <FormColumns>
          <Field
            name="number"
            widget="string"
            label="Number"
            :options="{ maxLength: 32, placeholder: '12A' }"
            help="Street number, not necessarily numeric (12A, 3 bis, …)."
          />

          <Field name="street" widget="string" label="Street" :options="{ maxLength: 255 }" />

          <Field name="zip" widget="string" label="Zip" :options="{ maxLength: 32 }" />

          <Field name="city" widget="string" label="City" :options="{ maxLength: 255 }" />

          <!-- A relation: the draft holds the ISO code, the dropdown is filled
               by the countries endpoint and its filter box searches there.
               `record` is what the field shows when it is read-only -- the
               nested country the GET already returned, so that mode costs no
               request. -->
          <Field
            name="country"
            widget="many2one"
            label="Country"
            :options="{
              fetch: searchCountries,
              record: country,
              permission: 'totem.country.read',
            }"
          />
        </FormColumns>
      </FieldGroup>

      <FormColumns>
        <!-- Stored as a calendar day: no time, no timezone. Persons only. -->
        <Field v-if="!draft.is_company" name="birth_date" widget="date" label="Birth date" />

        <!-- The only list-valued field of the form: the draft holds the tag ids, the chips are painted from the
             tags the GET already nested, and /contact-tags/ is not called
             until the dropdown is opened. -->
        <Field
          name="tags"
          widget="many2many_tags"
          label="Tags"
          :options="{
            fetch: searchContactTags,
            records: tags,
            permission: 'totem.contacttag.read',
            placeholder: 'Add a tag…',
          }"
        />
      </FormColumns>
    </template>
  </FormView>
</template>
