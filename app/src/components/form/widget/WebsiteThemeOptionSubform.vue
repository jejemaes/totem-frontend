<script setup lang="ts">
/*
 * The options of the selected website theme, as a folded sub-form.
 *
 * Deliberately NOT a <Field> widget -- it is not in Field.vue's registry and it
 * carries no `FieldValue`: its value is a BAG of values, keyed by option name,
 * and the <Field> system carries primitives (plus, since many2many_tags, a list
 * of them). Widening `FieldValue` into "or an object" would put every form in
 * the blast radius for the sake of one screen, so this follows the other route
 * the house rules describe: a detached widget under form/widget/, with the
 * caller re-implementing what <Form> would have done. See
 * WebsiteConfigurationView for the four things that means -- owning the value,
 * telling an edit from an untouched bag, re-seeding it when the record
 * reloads, and putting it in the payload.
 *
 * WHAT IS NOT DETACHED, and it is the interesting half: the FIELDS inside are
 * ordinary <Field>s. This component provides its own FORM_CONTEXT over the
 * option bag, so Field.vue -- still the one and only bridge to that context --
 * resolves the widgets through the one and only registry, and every option
 * gets the same label, help, error and readonly treatment as a real form field.
 * Vue resolves `inject` from the PARENT chain, so providing here shadows the
 * surrounding <Form> for this subtree only, and nothing leaks either way.
 *
 * The alternative -- nesting a second <Form> -- was rejected outright: it
 * renders its own <form> element, and a <form> inside a <form> is dropped by
 * the HTML parser, so the inner fields would land in the outer form with the
 * outer submit.
 *
 * The fields themselves are built ON THE FLY from the theme's `option_schema`,
 * which is JSON Schema published by the backend -- nothing here knows what an
 * option is called. See websiteThemeOptions.ts.
 */
import Message from 'primevue/message'
import Panel from 'primevue/panel'
import { computed, provide, ref, watch, type ComputedRef } from 'vue'

import { FORM_CONTEXT, type FormData } from '../context'
import Field from '../fields/Field.vue'
import type { FieldValue } from '../fields/types'

import {
  countThemeOptions,
  readThemeOptionSchema,
  splitThemeOptionErrors,
  themeOptionValues,
  withThemeOption,
  type ThemeOptionSource,
} from './websiteThemeOptions'

const props = defineProps<{
  /**
   * The overrides, keyed by option name. Controlled: no copy is kept here.
   *
   * Typed `unknown` per value because that is what arrives: whatever the
   * backend stored, possibly under a theme the site has since left. An EDIT
   * always emits a bag narrowed to the current schema (`themeOptionValues`);
   * the one case that emits something wider is the restore below, which hands
   * back an earlier bag byte for byte -- precisely so the caller's dirty check
   * goes quiet again.
   */
  modelValue: Record<string, unknown>
  /** The theme whose options these are. `null` hides the whole sub-form. */
  theme: ThemeOptionSource | null
  label?: string
  help?: string
  /** Locks every option. The caller passes its own `saving` here too. */
  readonly?: boolean
  /**
   * What the backend refused, as ONE string keyed `theme_options` -- the shape
   * parseApiError produces. Split back onto the options it names.
   */
  error?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [values: Record<string, unknown>] }>()

/**
 * The fields the selected theme describes. Recomputed when the theme changes.
 *
 * Named `optionForm` and not `form`: this file also provides a FORM_CONTEXT,
 * and two different things called `form` in one component is how the wrong one
 * gets read.
 */
const optionForm = computed(() => readThemeOptionSchema(props.theme?.option_schema))

/**
 * The overrides, narrowed to what the CURRENT schema declares.
 *
 * This is also what `set` below builds on, so the first edit after a theme
 * switch drops keys the new schema does not know -- which is not cosmetic: the
 * options model is `extra="forbid"`, so echoing a stale key back is a 422.
 */
const values = computed<FormData>(() =>
  themeOptionValues(props.modelValue, optionForm.value.fields),
)

const errors = computed(() =>
  splitThemeOptionErrors(props.error, optionForm.value.fields.map((field) => field.name)),
)

const readonly: ComputedRef<boolean> = computed(() => props.readonly ?? false)

/**
 * Options edited since the backend refused them.
 *
 * <Form> does the same with its own server errors, and for the same reason:
 * fixing a field must clear its error at once rather than wait for another
 * submit, and whether the NEW value is acceptable is the backend's call, not
 * this component's. Reset whenever a fresh refusal arrives -- that answer
 * describes the values as they now stand.
 */
const edited = ref(new Set<string>())

watch(
  () => props.error,
  () => {
    edited.value = new Set()
  },
)

const count = computed(() => countThemeOptions(values.value))

/*
 * A second FORM_CONTEXT, over the option bag.
 *
 * `values` is an accessor and not a plain object: every read goes through the
 * computed, so a <Field> reading `form.values[name]` takes a reactive
 * dependency on it and repaints when the bag changes. A snapshot taken here
 * once would freeze the whole sub-form on its first render.
 *
 * The three no-ops are no-ops for a reason each:
 *  - `register` must NOT seed a value. A mount that wrote would emit, and an
 *    emit is what marks the sub-form as edited -- the form would come up dirty
 *    over a record nobody touched.
 *  - `setRequired` / `unregister` have no constraint to carry: `ThemeMetaclass`
 *    refuses at startup a theme whose option has no default, so no option can
 *    be required. Validation here would be validation of a case the backend
 *    structurally forbids.
 */
provide(FORM_CONTEXT, {
  get values(): Readonly<FormData> {
    return values.value
  },
  set(name: string, value: FieldValue): void {
    emit('update:modelValue', withThemeOption(values.value, name, value))
    if (errors.value.fields[name]) edited.value = new Set([...edited.value, name])
  },
  register: (): void => {},
  setRequired: (): void => {},
  unregister: (): void => {},
  invalid: (name: string): boolean => Boolean(errorFor(name)),
  error: errorFor,
  readonly,
})

/** The refusal still standing for one option, if any. */
function errorFor(name: string): string | undefined {
  return edited.value.has(name) ? undefined : errors.value.fields[name]
}

/**
 * The values the author had typed for a theme, kept while they look at another.
 *
 * Without it, "switch theme, glance at its options, switch back, save" sends
 * `theme_options: {}` and wipes overrides nobody meant to touch -- the switch
 * back carries no `theme` key, so the backend's own reset does not even apply.
 * With it, going back restores the bag, the caller's dirty check goes quiet
 * again, and the save sends nothing at all.
 */
const remembered = new Map<string, Record<string, unknown>>()

/*
 * Switching theme empties the options, in front of the author.
 *
 * Not a convenience: `WebsiteQuerySet.update` resets `theme_options` to `{}`
 * whenever `theme` is in the payload, because the stored bag is keyed by the
 * PREVIOUS theme's schema and nothing maps one onto another. Showing the old
 * theme's values under the new theme's fields would promise a save that cannot
 * happen.
 *
 * Guarded on `previous`: the very first resolution is `undefined -> "default"`,
 * when the catalogue lands, and emitting there would mark the form dirty on
 * load.
 */
watch(
  () => props.theme?.id,
  (next, previous) => {
    if (!previous || next === previous) return
    remembered.set(previous, props.modelValue)
    emit('update:modelValue', (next && remembered.get(next)) || {})
  },
)

/**
 * Folded by default -- the options are a detail of a screen whose main subject
 * is elsewhere -- but NEVER folded over an error: a refusal the author cannot
 * see is a save that looks like it failed for no reason.
 */
const collapsed = ref(true)

watch(
  () => props.error,
  (message) => {
    if (message) collapsed.value = false
  },
  // `immediate`, so a panel that MOUNTS over an error opens too. Only the
  // save-time case happens today, but a folded panel hiding a refusal is worth
  // being paranoid about.
  { immediate: true },
)
</script>

<template>
  <!-- No theme, no sub-form: the schema comes with the theme, so there is
       nothing to build fields from. That is the state while the catalogue
       loads, and the one it stays in if that load failed. -->
  <Panel v-if="theme" v-model:collapsed="collapsed" toggleable class="theme-options">
    <template #header>
      <div class="theme-options__header">
        <span class="theme-options__title">{{ label ?? 'Theme options' }}</span>
        <!-- What is inside, while it is folded. Without it the panel is a
             closed box that says nothing about whether it holds anything. -->
        <small class="theme-options__count">
          <template v-if="!optionForm.fields.length">nothing to set</template>
          <template v-else-if="count">{{ count }} of {{ optionForm.fields.length }} set</template>
          <template v-else>{{ optionForm.fields.length }} available</template>
        </small>
      </div>
    </template>

    <p v-if="help" class="theme-options__help">{{ help }}</p>

    <!-- What the backend refused and this could not pin on an option: an extra
         key left by another client, or a form-level refusal. -->
    <Message v-if="errors.rest" severity="error" :closable="false">{{ errors.rest }}</Message>

    <Message v-if="!optionForm.fields.length" severity="secondary" :closable="false">
      This theme declares no option.
    </Message>

    <div v-else class="theme-options__fields">
      <!-- Ordinary <Field>s over the context provided above: same registry,
           same wrapper, same error and readonly handling as any other form. -->
      <Field
        v-for="field in optionForm.fields"
        :key="field.name"
        :name="field.name"
        :widget="field.widget"
        :label="field.label"
        :help="field.help"
        :options="field.options"
      />
    </div>

    <!-- An option whose schema no widget covers. Named rather than hidden: the
         alternative is a sub-form that silently claims to show everything. -->
    <Message v-if="optionForm.unsupported.length" severity="warn" :closable="false">
      Not editable here: {{ optionForm.unsupported.join(', ') }}. This theme declares
      them in a shape this screen cannot build a field for.
    </Message>
  </Panel>
</template>

<style scoped>
.theme-options {
  /* The panel is one field among the others, so it carries the same rhythm --
     <Form> lays its slot out with a grid gap, which this joins. */
  margin: 0;
}

.theme-options__header {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.theme-options__title {
  font-weight: 600;
}

.theme-options__count {
  color: var(--app-muted);
}

.theme-options__help {
  margin: 0 0 1rem;
  color: var(--app-muted);
  font-size: 0.9rem;
}

.theme-options__fields {
  display: grid;
  gap: 1rem;
}
</style>
