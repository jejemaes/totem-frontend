/*
 * The contracts between <CardView>, each of its cards, and the <Field>s in the
 * cards' slots.
 *
 * Two keys, not one, because there are two providers. CardView provides
 * CARD_CONTEXT once: where a <Field> declares the keys it reads, so `?fields=`
 * asks for them. Each card provides CARD_RECORD (through CardRecord.vue): the
 * record a <Field> displays. A single key holding both would need the record
 * to be re-provided by CardView itself, which renders every card -- it cannot
 * provide a different value to each.
 *
 * Unlike a list <Field>, a card <Field> DOES render: it sits in a per-record
 * slot, next to the view's own markup (`v-if="data.status === 'done'"`, a
 * Button), which is the whole point of a card. The declaration it makes is a
 * side effect of its first render on a skeleton card -- see CardView.vue.
 */

import { inject, type InjectionKey } from 'vue'

import type { CardRecord } from './fields/types'

export interface CardContext {
  /**
   * Declares the record keys a <Field> reads. Called by EVERY instance -- one
   * per card -- and only those mounted on the skeleton cards count: the set is
   * frozen when the first request leaves (see CardView.vue).
   */
  register(keys: readonly string[]): void
  /**
   * Called by a <Field> mounted on a REAL record: warns, in dev and once per
   * key, when the request did not carry what it reads -- a <Field> behind a
   * `v-if` the skeleton cards did not pass, missing from `extra-fields`.
   */
  check(keys: readonly string[]): void
}

export interface CardRecordContext {
  /** A getter: the provider is reused by the v-for when the page changes. */
  record(): CardRecord
  /** A skeleton card, before the first response: draw placeholders. */
  loading(): boolean
}

export const CARD_CONTEXT: InjectionKey<CardContext> = Symbol('totem.card')
export const CARD_RECORD: InjectionKey<CardRecordContext> = Symbol('totem.card.record')

/** Throws rather than returning null: an inert <Field> is far harder to
    diagnose than an error at mount time. */
export function useCardContext(): CardContext {
  const context = inject(CARD_CONTEXT, null)
  if (!context) throw new Error('A card <Field> must be used inside a <CardView>.')
  return context
}

export function useCardRecord(): CardRecordContext {
  const context = inject(CARD_RECORD, null)
  if (!context) {
    throw new Error('A card <Field> must be used inside one of the slots of a <CardView>.')
  }
  return context
}
