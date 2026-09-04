/*
 * Contracts shared by every field component.
 *
 * Types only: this module is imported by the ten components in this folder
 * and by ../context.ts, so it must never pull in a runtime dependency. The
 * import below is `import type`, so it is erased at compile time -- many2one.ts
 * imports FieldValue back from here, and only a runtime cycle would be a
 * problem.
 */

import type { RelationDisplay, RelationFetch, RelationRecord } from './many2one'

/** The widget names accepted by `<Field widget="...">`. */
export type Widget =
  | 'string'
  | 'boolean'
  | 'text'
  | 'integer'
  | 'float'
  | 'selection'
  | 'date'
  | 'color'
  | 'many2one'

/**
 * What a field can hold -- deliberately narrow: exactly what the nine widgets
 * can produce. A date is an ISO `YYYY-MM-DD` string, a colour is a palette
 * index and a many-to-one is the id of the related record, so none of them
 * widened this.
 *
 * INVARIANT held by all nine: an empty field is `null`. Never '', never NaN,
 * never undefined. The payload emitted by `save` is therefore readable without
 * a per-key emptiness rule.
 */
export type FieldValue = string | number | boolean | null

/** One entry of a dropdown. */
export interface SelectionChoice {
  value: string | number
  label: string
}

/** A bare string or number is shorthand for `{ value: x, label: String(x) }`. */
export type ChoiceInput = string | number | SelectionChoice

/**
 * Free-form configuration, interpreted by each widget. The keys below are the
 * ones the eight widgets read; anything else is carried and ignored -- which is
 * what makes this an extension point rather than a fixed schema.
 */
export interface FieldOptions {
  /** SelectionField: the choice list. Required for that widget. */
  choices?: ChoiceInput[]
  placeholder?: string
  /** TextField: textarea height. */
  rows?: number
  /** CharField */
  maxLength?: number
  /** IntegerField / FloatField */
  min?: number
  /** IntegerField / FloatField; ColorIntegerField: the highest palette index. */
  max?: number
  /** DateField: the selectable range, as ISO `YYYY-MM-DD` strings. */
  minDate?: string
  maxDate?: string
  /** FloatField: how many decimals are kept. */
  maxFractionDigits?: number
  /** BooleanField: force the control shape instead of deriving it from `required`. */
  display?: 'radio' | 'select'
  /**
   * ManyToOneField: loads the candidates. REQUIRED for that widget -- it is
   * what carries the endpoint, its `?fields=` list and the name of its search
   * parameter, all of which belong to a resource module.
   */
  fetch?: RelationFetch
  /**
   * ManyToOneField: the related record as the resource returned it, nested. It
   * is what read-only displays -- with it, that mode needs no request at all --
   * and what keeps the selected entry labelled while a search excludes it.
   */
  record?: RelationRecord | null
  /** ManyToOneField: builds the label of a record. Defaults to displayRelation. */
  relationDisplay?: RelationDisplay
  /** ManyToOneField: permission required to read the related endpoint. Without
      it the field degrades to its read-only display instead of a 403. */
  permission?: string
  /** ManyToOneField: the filter box of the dropdown. On by default. */
  filter?: boolean
  /** ManyToOneField: how long to wait after a keystroke before searching, in ms. */
  filterDelay?: number
  filterPlaceholder?: string
  [key: string]: unknown
}

/** The props every field component shares. */
export interface FieldProps {
  label?: string
  /** Explanatory line shown under the control. */
  help?: string
  widget?: Widget
  options?: FieldOptions
  required?: boolean
  readonly?: boolean
  /** Applied when the form's `data` does not carry the key. `null` when not given. */
  default?: FieldValue
}

/**
 * What a concrete widget takes: the shared props plus the v-model.
 *
 * A widget is an ordinary `v-model` component -- it injects nothing, which
 * keeps it usable alone, outside a <Form>. Field.vue is what bridges it to the
 * form context.
 */
export interface WidgetProps extends FieldProps {
  modelValue: FieldValue
  /** `true` when the field is in error: PrimeVue's red ring. */
  invalid?: boolean
  /** Error message to show under the control. */
  error?: string
  /**
   * Every value in the form, read-only. Supplied by <Field> so a widget can
   * depend on a sibling (conditional choices, and so on).
   */
  values?: Readonly<Record<string, FieldValue>>
}
