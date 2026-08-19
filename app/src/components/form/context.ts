/*
 * Le contrat entre `<Form>` et les `<Field>` déclarés dans son slot.
 *
 * Ce module est volontairement séparé des deux composants : `Form.vue` fournit
 * le contexte, `fields/Field.vue` le consomme, et aucun des deux n'a besoin
 * d'importer l'autre — donc pas de dépendance circulaire.
 */

import { inject, type ComputedRef, type InjectionKey } from 'vue'

import type { FieldValue } from './fields/types'

/** Les valeurs d'un formulaire, indexées par nom de champ. Plat : « a.b » n'est pas un chemin. */
export type FormData = Record<string, FieldValue>

export interface FormContext {
  /**
   * Le brouillon, en lecture. C'est ce qui donne à chaque champ l'accès aux
   * valeurs de TOUS les autres, et pas seulement à la sienne.
   *
   * La seule voie d'écriture est `set()`, pour qu'un champ ne puisse pas
   * réécrire discrètement une clé qui ne lui appartient pas.
   */
  values: Readonly<FormData>
  set(name: string, value: FieldValue): void
  /**
   * Déclare une clé auprès du formulaire.
   *
   * Ne la remplit avec `defaultValue` que si le `data` ne la portait pas du
   * tout : un `null` explicite est une valeur réelle (« vide connu », ce que
   * renvoie le backend) et n'est pas écrasé.
   */
  register(name: string, defaultValue: FieldValue): void
  /** Appelé depuis un `watchEffect` : `required` peut lui-même être réactif. */
  setRequired(name: string, required: boolean): void
  /** Au démontage (`v-if`) : retire la contrainte, garde la valeur. */
  unregister(name: string): void
  /** Vrai pour un champ laissé vide lors du dernier envoi refusé. */
  invalid(name: string): boolean
  /** Le `readonly` global du formulaire. Combiné en OU par `<Field>`. */
  readonly: ComputedRef<boolean>
}

export const FORM_CONTEXT: InjectionKey<FormContext> = Symbol('totem.form')

/**
 * Lève une erreur plutôt que de renvoyer `null` : un `<Field>` hors d'un
 * `<Form>` n'a rien à quoi se lier, et un champ silencieusement inerte est bien
 * plus difficile à diagnostiquer qu'une erreur au montage.
 */
export function useFormContext(): FormContext {
  const context = inject(FORM_CONTEXT, null)
  if (!context) {
    throw new Error('<Field> doit être utilisé à l’intérieur d’un <Form>.')
  }
  return context
}
