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
  | 'many2many_tags'

/**
 * What a field can hold -- deliberately narrow: exactly what the ten widgets
 * can produce. A date is an ISO `YYYY-MM-DD` string, a colour is a palette
 * index and a many-to-one is the id of the related record, so none of those
 * widened this. A many-to-many did: its value is the list of ids of the related
 * records, and there is no primitive that carries a list.
 *
 * INVARIANT held by the nine scalar widgets: an empty field is `null`. Never
 * '', never NaN, never undefined. A list-valued widget holds the same line by
 * being empty as `[]`, never as `null` -- see isEmpty, which reads both as
 * empty so `required` cannot be fooled.
 *
 * INVARIANT held by every list-valued widget, and load-bearing: it NEVER
 * mutates its value in place, it always emits a NEW array. <Form> keeps its
 * baseline as a shallow copy, so an in-place push would edit the baseline too
 * and the field would read as permanently untouched.
 */
export type FieldValue = string | number | boolean | null | (string | number)[]

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
   * ManyToOneField / ManyToManyTagsField: loads the candidates. REQUIRED for
   * both -- it is what carries the endpoint, its `?fields=` list and the name
   * of its search parameter, all of which belong to a resource module.
   */
  fetch?: RelationFetch
  /**
   * ManyToOneField: the related record as the resource returned it, nested. It
   * is what read-only displays -- with it, that mode needs no request at all --
   * and what keeps the selected entry labelled while a search excludes it.
   */
  record?: RelationRecord | null
  /**
   * ManyToManyTagsField: the related records as the resource returned them,
   * nested. The plural of `record`, and it carries more weight here: nothing is
   * fetched until the dropdown is opened, so until then this is the ONLY thing
   * that can label the chips. Omitting it shows bare ids.
   */
  records?: RelationRecord[] | null
  /** ManyToOneField / ManyToManyTagsField: builds the label of a record.
      Defaults to displayRelation. */
  relationDisplay?: RelationDisplay
  /** ManyToOneField / ManyToManyTagsField: permission required to read the
      related endpoint. Without it the field degrades to its read-only display
      instead of a 403. */
  permission?: string
  /** ManyToOneField / ManyToManyTagsField: the filter box of the dropdown.
      On by default. */
  filter?: boolean
  /** ManyToOneField / ManyToManyTagsField: how long to wait after a keystroke
      before searching, in ms. */
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
