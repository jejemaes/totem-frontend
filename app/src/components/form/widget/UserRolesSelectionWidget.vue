<script setup lang="ts">
/*
 * The roles of a user account: one dropdown per role category.
 *
 * Deliberately NOT a <Field> widget -- it is not in Field.vue's registry, it
 * injects no form context, and it imports nothing from ../fields. It only
 * mirrors their CONTRACT: value, form values and options in as props, the new
 * value out as `update:modelValue`. Its value is a plain `string[]` of role
 * ids, which the <Field> system cannot carry (a FieldValue is a primitive).
 *
 * Consequence for the caller: the value lives in the parent, so the parent also
 * owns what <Form> would have done -- seeding it from the record, telling an
 * edit from an untouched list, and putting it in the payload. See UserFormView.
 */
import Button from 'primevue/button'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import { computed, onScopeDispose, ref, shallowRef, useId } from 'vue'

import { ApiError } from '@/api/client'
import { can } from '@/auth/permissions'
import { fetchAllUserRoles } from '@/resources/userRoles'

import {
  groupRoles,
  selectedInGroup,
  unmanagedRoleIds,
  withGroupSelection,
  type RoleGroup,
  type UserRolesSelectionOptions,
} from './userRolesSelection'

const props = defineProps<{
  /** The granted role ids. Controlled: the widget keeps no copy of them. */
  modelValue: string[]
  /**
   * Every value of the surrounding form, read-only, so a rule can one day
   * depend on a sibling field. Loosely typed on purpose: importing FormData
   * would tie this widget to the <Field> system it is meant to stay out of.
   */
  values?: Readonly<Record<string, unknown>>
  options?: UserRolesSelectionOptions
  label?: string
  help?: string
  /** Locks every dropdown. The caller passes its own `saving` here. */
  readonly?: boolean
  /** Red ring, for a refusal the backend pinned on the roles. */
  invalid?: boolean
  error?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [ids: string[]] }>()

const baseId = useId()
const labelId = useId()

/*
 * A computed rather than a bare call in the template: `can()` instantiates the
 * store on every evaluation -- same reason as UsersView.
 *
 * This is a UX affordance, not a security boundary: the backend refuses the
 * request anyway. It is also why nothing here needs a fallback for a user who
 * lacks the permission -- there is simply no widget.
 */
const canReadRoles = computed(() => can('totem.userrole.read'))

/** The catalogue, grouped. The ONLY state this component owns. */
const groups = shallowRef<RoleGroup[]>([])

const loading = ref(false)
/** A failure to read the catalogue -- distinct from the `error` prop, which is
    the backend refusing a value. */
const loadError = ref<string | null>(null)

// Same race guard as useResourceForm.load: a monotonic ticket gates every state
// write and the superseded request is aborted. Retry makes this a real case.
let seq = 0
let inFlight: AbortController | undefined

async function load(): Promise<void> {
  // Not merely an optimisation: the request is a guaranteed 403, and there is
  // no widget to fill.
  if (!canReadRoles.value) return

  const ticket = ++seq
  inFlight?.abort()
  const controller = (inFlight = new AbortController())

  loading.value = true
  loadError.value = null

  try {
    const roles = await fetchAllUserRoles(controller.signal)
    if (ticket !== seq) return
    groups.value = groupRoles(roles, props.options?.groupLabels)
  } catch (caught) {
    if (ticket !== seq || controller.signal.aborted) return
    // An abort is not a failure: the `aborted` guard above keeps its
    // DOMException from being shown as a message.
    loadError.value = caught instanceof ApiError ? caught.message : 'Could not load the roles.'
  } finally {
    if (ticket === seq) loading.value = false
  }
}

/** Which role each dropdown shows, derived -- never stored. */
const selection = computed<Record<string, string | null>>(() =>
  Object.fromEntries(groups.value.map((group) => [group.key, selectedInGroup(props.modelValue, group)])),
)

/** Granted roles no dropdown can represent. Shown, never silently dropped. */
const unmanaged = computed(() => unmanagedRoleIds(props.modelValue, groups.value))

/**
 * The one and only emit.
 *
 * Nothing emits on mount, on load or on error, and there is no watcher syncing
 * the dropdowns back into the value: an emit is what marks the roles as edited,
 * and an edited roles list is what reaches the PATCH body -- where an empty one
 * wipes the account's roles. Only a user gesture may do that.
 */
function onSelect(group: RoleGroup, next: unknown): void {
  const id = typeof next === 'string' && next !== '' ? next : null
  emit('update:modelValue', withGroupSelection(props.modelValue, group, id))
}

// In setup rather than onMounted: one tick earlier, so the skeleton is what the
// first paint shows instead of an empty box.
void load()

onScopeDispose(() => inFlight?.abort())
</script>

<template>
  <!-- The whole widget disappears without the permission: there is no
       read-only fallback, because the names behind the ids are not readable
       either. -->
  <div v-if="canReadRoles" class="roles">
    <!-- A <span>, not a <label for>: there are N controls and no single one to
         point at. The group below references it through aria-labelledby, the
         way BooleanField's radio group does. -->
    <span v-if="label" :id="labelId" class="roles__label">{{ label }}</span>

    <div v-if="loading" class="roles__groups">
      <!-- Two placeholders: the real count is unknown until the catalogue
           lands, and one would understate a multi-category instance. -->
      <Skeleton v-for="n in 2" :key="n" height="3.2rem" />
    </div>

    <!-- A failed fetch leaves the value untouched -- it lives in the parent --
         so this degrades to "not editable right now", never to a silent wipe. -->
    <Message v-else-if="loadError" severity="error" :closable="false">
      <div class="roles__retry">
        <span>{{ loadError }}</span>
        <Button
          label="Retry"
          size="small"
          severity="danger"
          outlined
          :disabled="readonly"
          @click="load"
        />
      </div>
    </Message>

    <Message v-else-if="!groups.length" severity="warn" :closable="false">
      No role is defined on this instance.
    </Message>

    <div v-else class="roles__groups" role="group" :aria-labelledby="label ? labelId : undefined">
      <div v-for="group in groups" :key="group.key" class="roles__group">
        <!-- A real <label for> here: one group is one focusable dropdown. -->
        <label :for="`${baseId}-${group.key}`" class="roles__group-label">{{ group.label }}</label>
        <Select
          :input-id="`${baseId}-${group.key}`"
          fluid
          :options="group.options"
          option-label="name"
          option-value="id"
          :model-value="selection[group.key] ?? null"
          show-clear
          :disabled="readonly"
          :invalid="invalid"
          :placeholder="options?.placeholder ?? 'None'"
          @update:model-value="(next: unknown) => onSelect(group, next)"
        />
      </div>
    </div>

    <!-- Hidden while loading, when every id would look unmanaged. -->
    <div v-if="!loading && unmanaged.length" class="roles__unmanaged">
      <Tag v-for="id in unmanaged" :key="id" :value="id" severity="secondary" />
      <small class="roles__help">
        Granted roles that no dropdown covers -- a deleted role, or a second one
        in the same category. They are left exactly as they are.
      </small>
    </div>

    <small v-if="error" class="roles__error">{{ error }}</small>
    <small v-else-if="help" class="roles__help">{{ help }}</small>
  </div>
</template>

<style scoped>
/* Mirrors FieldWrapper's .field spacing so the widget lines up with the fields
   around it -- without importing it: that component belongs to the <Field>
   implementation. */
.roles {
  display: grid;
  gap: 0.35rem;
}

.roles__label {
  font-size: 0.9rem;
  color: var(--app-muted);
}

.roles__groups {
  display: grid;
  gap: 0.75rem;
}

.roles__group {
  display: grid;
  gap: 0.25rem;
}

.roles__group-label {
  font-size: 0.85rem;
  color: var(--app-muted);
}

.roles__retry {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.roles__unmanaged {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.roles__help,
.roles__error {
  font-size: 0.85rem;
}

.roles__help {
  color: var(--app-muted);
}

.roles__error {
  color: var(--p-red-500);
}
</style>
