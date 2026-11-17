/*
 * What a record action IS, and which ones a screen shows -- with no dependency
 * on Vue.
 *
 * One declaration serves every container that acts on records: the "⋮" menu
 * of a card, the column of buttons beside a form, and (to come) the bar over a
 * list's selection. They used to be one type per container -- `CardMenuItem`
 * first -- and an action such as "Archive" would have been declared once per
 * screen it appears on, each copy free to forget the permission or the state
 * the others check.
 *
 * Only the DECLARATION is shared here. How an action is drawn (a menu entry, a
 * button) and what happens around its run (a busy flag, a refusal, a reload)
 * belong to its container and to `useActionRunner`.
 */

/**
 * One action on records.
 *
 * `run` is ALWAYS handed an array -- `[record]` from a form or a card, the
 * selection from a list -- so the same declaration works in all three. An
 * action written for one record is therefore never run on a selection unless
 * it says `multi`.
 */
export interface RecordAction<R = Record<string, unknown>> {
  /** Unique within its list: the busy button, the rendering key. */
  key: string
  label: string
  /** A primeicons class, `pi pi-send`: the icon convention of the whole app. */
  icon?: string
  /** A PrimeVue button severity. None is the primary colour. */
  severity?: 'secondary' | 'success' | 'info' | 'warn' | 'danger' | 'contrast'
  /** The scope it needs; hidden without it. Cosmetic: the backend re-checks. */
  permission?: string
  /**
   * Hides the action for a record when false -- its state, a flag. Asked of
   * the STORED record, never of a form's unsaved draft: "Publish" must not
   * appear because a field was typed into. On a selection, every record must
   * pass.
   */
  condition?(record: R): boolean
  /**
   * Offered on a selection of several records. OFF by default: an action that
   * opts in has been written for a set, the others would run 50 times what
   * was meant for one.
   */
  multi?: boolean
  /** Asked before running, through the app's one confirm dialog. */
  confirm?: { header: string; message: string }
  /**
   * The container reloads its records once the run succeeds. OFF by default:
   * an action that opens a Dialog or downloads a file changed nothing, and a
   * reload would flash a form's skeleton for it. An action that answers the
   * updated record needs no reload either -- see `run`.
   */
  reload?: boolean
  /**
   * Does the work. A record it resolves to is the stored record after it: a
   * form re-seeds from it without a request, a card grid reloads its page.
   */
  run(records: R[]): Promise<R | void> | R | void
}

/** A rule between two groups of a menu. A menu concern only, hence kept out
    of `RecordAction`: a button column has nothing to separate. */
export interface ActionSeparator {
  separator: true
}

export type ActionEntry<R = Record<string, unknown>> = RecordAction<R> | ActionSeparator

export function isSeparator<R>(entry: ActionEntry<R>): entry is ActionSeparator {
  return 'separator' in entry && entry.separator === true
}

/**
 * The entries to show for `records`, in their declared order.
 *
 * An action is hidden on an empty set, on several records unless `multi`,
 * without its permission, or when one record fails its condition. Separators
 * left with nothing to separate -- leading, trailing, or doubled once a
 * conditional entry is gone -- are dropped: a menu opening on a rule reads as
 * broken.
 *
 * `can` is a callback rather than an import of `@/auth/permissions`, which
 * would pull the Pinia store into a module tested without one.
 */
export function visibleActions<R>(
  entries: readonly ActionEntry<R>[],
  records: readonly R[],
  can: (permission: string) => boolean,
): ActionEntry<R>[] {
  if (!records.length) return []

  const result: ActionEntry<R>[] = []
  for (const entry of entries) {
    if (isSeparator(entry)) {
      if (result.length && !isSeparator(result[result.length - 1])) result.push(entry)
      continue
    }
    if (records.length > 1 && !entry.multi) continue
    if (entry.permission !== undefined && !can(entry.permission)) continue
    const condition = entry.condition
    if (condition && !records.every((record) => condition(record))) continue
    result.push(entry)
  }
  if (result.length && isSeparator(result[result.length - 1])) result.pop()
  return result
}

/** `visibleActions` without the separators: a button column draws none. */
export function visibleButtons<R>(
  actions: readonly ActionEntry<R>[],
  records: readonly R[],
  can: (permission: string) => boolean,
): RecordAction<R>[] {
  return visibleActions(actions, records, can).filter(
    (entry): entry is RecordAction<R> => !isSeparator(entry),
  )
}
