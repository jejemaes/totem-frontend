/*
 * Contrats partagés par tous les composants de champ.
 *
 * Ce module ne contient que des types : il est importé par les huit composants
 * du dossier ainsi que par `../context.ts`, et ne doit donc jamais tirer de
 * dépendance à l'exécution.
 */

/** Les noms de widget acceptés par `<Field widget="…">`. */
export type Widget = 'string' | 'boolean' | 'text' | 'integer' | 'float' | 'selection'

/**
 * Ce qu'un champ peut contenir — volontairement étroit : exactement ce que les
 * six widgets savent produire.
 *
 * INVARIANT tenu par les six widgets : un champ vide vaut `null`. Jamais '',
 * jamais NaN, jamais undefined. Le payload émis par `save` est donc lisible
 * sans règle de vide par clé.
 */
export type FieldValue = string | number | boolean | null

/** Une entrée de liste déroulante. */
export interface SelectionChoice {
  value: string | number
  label: string
}

/** Une chaîne / un nombre nu est un raccourci pour `{ value: x, label: String(x) }`. */
export type ChoiceInput = string | number | SelectionChoice

/**
 * Configuration libre, interprétée par chaque widget. Les clés ci-dessous sont
 * celles que les six widgets lisent ; tout le reste est transporté et ignoré —
 * c'est ce qui en fait un point d'extension et non un schéma figé.
 */
export interface FieldOptions {
  /** SelectionField : la liste des choix. Obligatoire pour ce widget. */
  choices?: ChoiceInput[]
  placeholder?: string
  /** TextField : hauteur du textarea. */
  rows?: number
  /** CharField */
  maxLength?: number
  /** IntegerField / FloatField */
  min?: number
  max?: number
  /** FloatField : nombre de décimales conservées. */
  maxFractionDigits?: number
  /** BooleanField : forcer la forme du contrôle au lieu de la déduire de `required`. */
  display?: 'radio' | 'select'
  [key: string]: unknown
}

/** Les props communes à tous les composants de champ. */
export interface FieldProps {
  label?: string
  /** Ligne d'explication affichée sous le contrôle. */
  help?: string
  widget?: Widget
  options?: FieldOptions
  required?: boolean
  readonly?: boolean
  /** Appliqué quand le `data` du formulaire ne porte pas la clé. `null` si non fourni. */
  default?: FieldValue
}

/**
 * Ce que prend un widget concret : les props communes plus le v-model.
 *
 * Un widget est un composant `v-model` ordinaire — il n'injecte rien, ce qui le
 * rend utilisable seul, hors d'un `<Form>`. C'est `Field.vue` qui fait le pont
 * avec le contexte du formulaire.
 */
export interface WidgetProps extends FieldProps {
  modelValue: FieldValue
  /** `true` quand le champ est en erreur : anneau rouge PrimeVue. */
  invalid?: boolean
  /** Message d'erreur à afficher sous le contrôle. */
  error?: string
  /**
   * Toutes les valeurs du formulaire, en lecture. Fourni par `<Field>` pour
   * qu'un widget puisse dépendre d'un voisin (choix conditionnels, etc.).
   */
  values?: Readonly<Record<string, FieldValue>>
}
