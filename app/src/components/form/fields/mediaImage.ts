/*
 * The logic behind MediaImageField, with no dependency on Vue.
 *
 * Same reason as many2one.ts and values.ts: this is the part that quietly shows
 * the wrong image -- or none at all over a stored value -- so it has to be
 * testable in a `node` environment, without mounting a component.
 *
 * THE PROBLEM IT SOLVES. One concept, three shapes, because three different
 * routes describe it:
 *
 *   the website payload   { id, name, content, mimetype }   the URL is `content`
 *   a picked tile         { id, url, name, mimetype }       the URL is `url`
 *   an upload result      { id?, url, name? }               the URL is `url`
 *
 * `content` is what the API calls a media's file on every schema that nests one
 * (MediaDisplayNameSchema), while HtmlImageItem -- the picker's own type -- was
 * named for what an `<img>` needs. Reading the wrong key renders a broken
 * thumbnail, which nothing in the type system catches and nobody notices until
 * a user opens the form.
 */

import type { HtmlImageItem } from './html'
import { relationRecordFor, type RelationRecord } from './many2one'
import type { FieldValue } from './types'

/** What read-only and the caption fall back to. Never an empty line. */
export const NO_IMAGE_LABEL = '—'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** An id usable as a field value -- and as a payload value. */
function usableId(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string' && value !== '') return value
  return null
}

function usableText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/**
 * Any of the three shapes above -> the one the picker and the preview speak.
 *
 * `url` is read before `content`: a record carrying both has already been
 * through here, and the picker's own key is the one this app normalises on.
 *
 * Null unless there is BOTH a usable id and a URL. An entry with no id could
 * not be stored, and one with no URL has nothing to show -- returning a
 * half-item would move the check into the template, where it would be a
 * broken-image glyph instead of a decision.
 */
export function toImageItem(record: unknown): HtmlImageItem | null {
  if (!isRecord(record)) return null

  const id = usableId(record.id)
  if (id === null) return null

  const url = usableText(record.url) ?? usableText(record.content)
  if (url === null) return null

  return {
    id,
    url,
    // The id as the caption of last resort: a tile with no name is unreadable,
    // and the id at least identifies the row.
    name: usableText(record.name) ?? id,
    mimetype: typeof record.mimetype === 'string' ? record.mimetype : null,
  }
}

/**
 * The image describing the CURRENT value, or null.
 *
 * Composed in this order on purpose, and it is also the only order that
 * compiles: `relationRecordFor` takes a `RelationRecord`, a type with an index
 * signature, and `HtmlImageItem` is an interface without one -- so normalising
 * first and guarding after is a type error. Guarding first is better anyway:
 * the stale-record rule is applied to the record as the resource returned it,
 * and normalisation only ever sees one that already matches the value.
 *
 * That rule is the whole point: `options.record` describes the record the form
 * LOADED, and a stale one must never label a value it does not describe.
 */
export function coverImageFor(
  value: FieldValue,
  record: RelationRecord | null | undefined,
): HtmlImageItem | null {
  return toImageItem(relationRecordFor(value, record))
}

/**
 * What to write next to the preview.
 *
 * A value with no image to describe it shows its raw id rather than nothing:
 * the id is a poor label, but it is the truth -- pretending the field is empty
 * over a stored value is the failure to avoid. Same line ManyToOneField draws.
 */
export function coverLabel(value: FieldValue, item: HtmlImageItem | null): string {
  if (item) return item.name
  const id = usableId(value)
  return id ?? NO_IMAGE_LABEL
}

/**
 * The upload result as an item, or null when the uploader gave back no id.
 *
 * Null is not a failure to swallow: the caller must SAY so. The file really is
 * on the server -- only its identity is missing -- and a field whose value is
 * an id cannot fall back to the URL without writing a path into a foreign key.
 *
 * The file's own name is the fallback caption, exactly as HtmlField uses it for
 * the `alt`: the store may answer without one.
 */
export function uploadedImageItem(
  result: { id?: string; url: string; name?: string } | null | undefined,
  file: { name: string },
): HtmlImageItem | null {
  if (!result) return null
  return toImageItem({ id: result.id, url: result.url, name: result.name ?? file.name })
}

/**
 * The refusal for a file over the limit, or null when it may be sent.
 *
 * Lifted out of HtmlField's inline version so both surfaces word it the same,
 * and refused in the browser for the reason that one documents: NOTHING in the
 * stack answers an oversized upload with a JSON 413 a user could read -- nginx
 * allows 300 MB and its own 413 is an HTML page, and Django's
 * DATA_UPLOAD_MAX_MEMORY_SIZE excludes file fields by design.
 *
 * A limit of 0 or less means "no limit configured", not "refuse everything".
 */
export function oversizeMessage(file: { size: number }, maxBytes: unknown): string | null {
  const max = Number(maxBytes ?? 0)
  if (!Number.isFinite(max) || max <= 0 || file.size <= max) return null
  return (
    `This image is too large (${Math.round(file.size / 1024)} kB). ` +
    `The limit is ${Math.round(max / 1024)} kB.`
  )
}
