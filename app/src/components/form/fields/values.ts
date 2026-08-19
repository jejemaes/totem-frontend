/*
 * Helpers de valeurs, sans aucune dépendance à Vue.
 *
 * Toute la logique un peu piégeuse des champs est concentrée ici précisément
 * pour être testable en environnement `node`, sans monter de composant.
 */

import type { ChoiceInput, FieldValue, SelectionChoice } from './types'

/**
 * Un champ est vide quand il vaut `null`, `undefined` ou la chaîne vide.
 *
 * Ce qui n'est délibérément PAS vide : `false` (un booléen auquel on a répondu
 * « Non ») et `0` (un nombre parfaitement valide). Confondre les deux est le
 * bug classique de la validation `required`.
 */
export function isEmpty(value: FieldValue | undefined): boolean {
  return value === undefined || value === null || value === ''
}

/**
 * Ramène une valeur quelconque à un nombre, ou à `null`.
 *
 * Le `data` fourni au formulaire n'est pas forcément bien typé (il peut venir
 * d'un JSON backend), donc les champs numériques s'alimentent à travers cette
 * fonction plutôt que de faire confiance à leur `modelValue`.
 */
export function toNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  // `true` vaudrait 1 avec Number() : un booléen n'a rien à faire dans un champ
  // numérique, on préfère le vide au silence.
  return null
}

/**
 * Normalise la liste de choix d'un `SelectionField`.
 *
 * Accepte la forme complète `{ value, label }` et le raccourci `['a', 'b']`,
 * pour que les listes triviales restent lisibles dans le template.
 */
export function normaliseChoices(input: ChoiceInput[] | undefined): SelectionChoice[] {
  if (!Array.isArray(input)) return []
  return input.map((choice) =>
    typeof choice === 'string' || typeof choice === 'number'
      ? { value: choice, label: String(choice) }
      : choice,
  )
}
