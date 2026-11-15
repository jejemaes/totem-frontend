/**
 * /api/v1/document/tags/ -- what documents are sorted by. There are no folders:
 * a document carries tags, and every tag belongs to a category for good.
 *
 * A tag has NO colour of its own: it shows its category's, which the read
 * schemas nest (`category: {id, name, color}`). The chip widgets read a flat
 * `color`, so every tag leaving this module is flattened by `withCategoryColor`
 * -- one place, rather than each screen remembering to.
 */

import { apiDelete, apiFetch, patchJson, postJson } from '@/api/client'
import {
  fetchAllPages,
  fetchDisplayNames,
  fetchList,
  type ListQuery,
  type Page,
} from '@/api/list'

const PATH = '/document/tags/'

function detailPath(id: string): string {
  return `${PATH}${encodeURIComponent(id)}/`
}

/** The category as a tag nests it -- `DocumentTagCategoryDisplayNameSchema`. */
export type DocumentTagCategoryRef = {
  id: string
  name: string
  /** Index into the front-end palette -- see @/components/colors. */
  color: number
}

/**
 * A tag as a document nests it, or as the tags dropdown lists it, AFTER
 * `withCategoryColor`: `color` is the category's, copied up.
 *
 * A `type`, for the implicit index signature `RelationRecord` needs.
 */
export type DocumentTagRef = {
  id: string
  name: string
  category?: DocumentTagCategoryRef | null
  /** The category's colour; null when the category was not asked for. */
  color: number | null
}

/**
 * The tag with its category's colour as its own, which is the key ColorTag and
 * the chip widgets read. Tolerant of a missing category -- a `?fields=` without
 * it, a display-name answer -- which paints the chip neutral rather than
 * throwing.
 */
export function withCategoryColor<T extends { category?: DocumentTagCategoryRef | null }>(
  tag: T,
): T & { color: number | null } {
  const color = tag.category?.color
  return { ...tag, color: typeof color === 'number' ? color : null }
}

/** One row of a category's tag list. The category is not asked for: the list
    is already scoped to one. */
export type DocumentTagRow = {
  id: string
  name: string
  sequence: number
}

export const DOCUMENT_TAG_LIST_FIELDS = [
  'id',
  'name',
  'sequence',
] as const satisfies readonly (keyof DocumentTagRow)[]

/** Fields the backend accepts in `?ordering=` and a screen shows. */
export const DOCUMENT_TAG_SORTABLE = ['sequence', 'name'] as const

/** A `type`, for the implicit index signature `ListFilters` needs. */
export type DocumentTagFilters = {
  /** Matches the name, case-insensitive. */
  search?: string | null
  /** Ids of categories, comma-joined on the wire. */
  category?: string | string[] | null
}

export function listDocumentTags(
  query: ListQuery<DocumentTagFilters>,
  signal?: AbortSignal,
): Promise<Page<DocumentTagRow>> {
  return fetchList<DocumentTagRow>(PATH, query, DOCUMENT_TAG_LIST_FIELDS, signal)
}

/** What the tags dropdown asks for: the category too, for the colour. */
const DOCUMENT_TAG_RELATION_FIELDS = ['id', 'name', 'category'] as const

/**
 * The loader of the tags dropdown: `RelationFetch` shaped, every tag matching
 * `search`, coloured. No `ordering`: the dropdown sorts by what it displays.
 */
export async function searchDocumentTags(
  search: string | null,
  signal?: AbortSignal,
): Promise<DocumentTagRef[]> {
  const tags = await fetchAllPages<Omit<DocumentTagRef, 'color'>>(
    PATH,
    DOCUMENT_TAG_RELATION_FIELDS,
    { filters: { search } },
    signal,
  )
  return tags.map(withCategoryColor)
}

/**
 * The labels of a few known tags: `RelationResolve` shaped, for a filter. The
 * display-name schema nests the category as well, so the chips are coloured.
 */
export async function documentTagDisplayNames(
  ids: string[],
  signal?: AbortSignal,
): Promise<DocumentTagRef[]> {
  const tags = await fetchDisplayNames<Omit<DocumentTagRef, 'color'>>(PATH, ids, signal)
  return tags.map(withCategoryColor)
}

/** What GET /document/tags/{id}/ returns. */
export type DocumentTagDetail = DocumentTagRow & {
  category: DocumentTagCategoryRef | null
}

export function fetchDocumentTag(id: string, signal?: AbortSignal): Promise<DocumentTagDetail> {
  return apiFetch<DocumentTagDetail>(detailPath(id), { signal })
}

export interface DocumentTagCreatePayload {
  /** Unique WITHIN its category: a duplicate comes back as a field error. */
  name: string
  /** The id of the category. Required: a tag never lives outside one. */
  category: string
  sequence?: number
}

export function createDocumentTag(payload: DocumentTagCreatePayload): Promise<DocumentTagDetail> {
  return postJson<DocumentTagDetail>(PATH, payload)
}

export type DocumentTagUpdatePayload = Partial<DocumentTagCreatePayload>

export function updateDocumentTag(
  id: string,
  payload: DocumentTagUpdatePayload,
): Promise<DocumentTagDetail> {
  return patchJson<DocumentTagDetail>(detailPath(id), payload)
}

export function deleteDocumentTag(id: string): Promise<void> {
  return apiDelete(detailPath(id))
}

/**
 * `POST /document/tags/resequence/`: numbers the tags `offset + 1`..`offset + n`
 * in the order of `ids`.
 *
 * `offset` is where the first id sits in the whole list, which is what lets ONE
 * page of a paged list be reordered on its own: page 2 of ten rows sends its
 * ten ids and 10. Unlike the budget lines' route, the body is an object.
 * Needs `totem.documenttag.update`; answers 201 with no body.
 */
export function resequenceDocumentTags(ids: string[], offset: number): Promise<void> {
  return postJson<void>(`${PATH}resequence/`, { ids, offset })
}
