<script setup lang="ts">
import Button from 'primevue/button'
import Card from 'primevue/card'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import type { FormData } from '@/components/form/context'
import Field from '@/components/form/fields/Field.vue'
import type { FieldValue } from '@/components/form/fields/types'
import Form from '@/components/form/Form.vue'
import { useResourceForm } from '@/composables/useResourceForm'
import { searchContactTags } from '@/resources/contactTags'
import { searchCountries, type CountryRef } from '@/resources/countries'
import {
  createContact,
  fetchContact,
  updateContact,
  type ContactCreatePayload,
  type ContactDetail,
  type ContactTagRef,
  type ContactUpdatePayload,
} from '@/resources/contacts'

/*
 * One screen for both routes: /contacts/new and /contacts/:id.
 * `useResourceForm` owns everything that differs -- loading the record, POST
 * versus PATCH, the error mapping -- so what is left here is the field list and
 * the two labels that change.
 *
 * Simpler than UserFormView: every value lives in the <Form> draft and there is
 * no detached widget to seed or to diff. Both relations are ordinary fields --
 * the country holds the id of its row, the tags hold a list of ids, and <Form>
 * diffs the list for us.
 */
const router = useRouter()
const route = useRoute()

/**
 * The list's own query (page, ordering, search) rides along on this screen's
 * URL, so Cancel and the post-save redirect land on the list the user actually
 * left.
 */
const listRoute = computed(() => ({ name: 'contacts', query: route.query }))

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
 * Both payloads are built key by key, never by copying the draft.
 *
 * Both relations go out as ids -- `country` as the bare ISO code, `tags` as the
 * list of tag ids -- which is what the draft holds. A relation is written as
 * the id of its target, never as the nested object the GET returns.
 *
 * What is NOT sent still matters: the backend deserialises with
 * `exclude_unset=True`, so an omitted `tags` LEAVES THE RELATION ALONE while an
 * explicit `[]` clears it. updatePayload below therefore mentions the key only
 * when <Form> reports it as edited -- editing a phone number must not touch the
 * tags.
 */
function createPayload(values: FormData): ContactCreatePayload {
  return {
    last_name: text(values.last_name) ?? '',
    first_name: text(values.first_name),
    email: text(values.email),
    mobile: text(values.mobile),
    birth_date: text(values.birth_date),
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
 */
function updatePayload(changed: FormData): ContactUpdatePayload {
  const body: ContactUpdatePayload = {}
  if ('last_name' in changed) body.last_name = text(changed.last_name) ?? ''
  if ('first_name' in changed) body.first_name = text(changed.first_name)
  if ('email' in changed) body.email = text(changed.email)
  if ('mobile' in changed) body.mobile = text(changed.mobile)
  if ('birth_date' in changed) body.birth_date = text(changed.birth_date)
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
  // A getter, not a plain value: vue-router reuses this component when only the
  // param changes. `null` on the create route.
  id: () => (route.params.id ? String(route.params.id) : null),
  defaults: {
    last_name: null,
    first_name: null,
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
    last_name: contact.last_name,
    first_name: contact.first_name,
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
  onLoaded: (contact) => {
    country.value = contact?.country ?? null
    tags.value = contact?.tags ?? []
  },
  create: (values) => createContact(createPayload(values)),
  update: (id, changed) => updateContact(id, updatePayload(changed)),
  notFoundMessage: 'This contact no longer exists.',
  onSaved: (contact, mode) =>
    router.push(
      mode === 'create'
        ? // The backend's `search` matches the first name, the last name or the
          // email, so the list opens on the row just created. Without it, with
          // the default last-name-ascending sort and ten rows per page, a new
          // contact can land on page 3 and the redirect looks like nothing
          // happened.
          { name: 'contacts', query: { search: contact.last_name } }
        : listRoute.value,
    ),
})

const { isNew, data, loading, loadError, saving, error, fieldErrors } = form

/** The contact's name titles the page once the record has landed. */
const title = computed(() => {
  if (isNew.value) return 'New contact'
  const last = text(data.value?.last_name ?? null)
  if (!last) return 'Contact'
  const first = text(data.value?.first_name ?? null)
  return first ? `${first} ${last}` : last
})
const saveLabel = computed(() => (isNew.value ? 'Create' : 'Save'))
</script>

<template>
  <section class="page">
    <header class="page__header">
      <div>
        <h1>{{ title }}</h1>
      </div>
    </header>

    <Message v-if="loadError" severity="error" :closable="false" class="page__message">
      <div class="page__error">
        <span>{{ loadError }}</span>
        <RouterLink :to="listRoute">
          <Button label="Back to the list" size="small" severity="danger" outlined />
        </RouterLink>
      </div>
    </Message>

    <Message v-if="error" severity="error" :closable="false" class="page__message">
      {{ error }}
    </Message>

    <Card v-if="!loadError" class="contact-form">
      <template #content>
        <!-- Placeholders with the form's real shape, so the card does not jump
             when the record lands. -->
        <div v-if="loading" class="contact-form__skeleton">
          <Skeleton v-for="n in 11" :key="n" height="3.2rem" />
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
            <!-- The last name is the only field the model requires. -->
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

            <Field
              name="email"
              widget="string"
              label="Email"
              :options="{ maxLength: 255, placeholder: 'jane.doe@example.com' }"
            />

            <Field name="mobile" widget="string" label="Mobile" :options="{ maxLength: 32 }" />

            <!-- Stored as a calendar day: no time, no timezone. -->
            <Field name="birth_date" widget="date" label="Birth date" />

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

            <!-- The other relation, and the only list-valued field of the form:
                 the draft holds the tag ids, the chips are painted from the
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
          </template>

          <template #actions="{ dirty }">
            <RouterLink :to="listRoute">
              <Button label="Cancel" severity="secondary" text :disabled="saving" />
            </RouterLink>
            <!-- Nothing edited means nothing to PATCH, so on an existing record
                 Save has no work to do. A create always has. -->
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
  </section>
</template>

<style scoped>
/* A full-width form is unreadable: the fields themselves are short. */
.contact-form {
  max-width: 36rem;
}

.contact-form__skeleton {
  display: grid;
  gap: 1rem;
}

.page__error {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
</style>
