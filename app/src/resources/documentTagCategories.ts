/**
 * /api/v1/document/tag-categories/ -- the groups the document tags are sorted
 * into.
 *
 * A category carries the COLOUR its tags are painted with: a tag has none of
 * its own, so two tags of one category always read as siblings. Full CRUD,
 * each behind its own `totem.documenttagcategory.*` scope, plus a resequence
 * route no screen uses yet.
 */

import { apiDelete, apiFetch, fetchDefaultValues, patchJson, postJson } from '@/api/client'
import { fetchAllPages, fetchDisplayNames } from '@/api/list'

const PATH = '/document/tag-categories/'

function detailPath(id: string): string {
  return `${PATH}${encodeURIComponent(id)}/`
}

/**
 * One category, as the list and the detail both return it.
 *
 * `color` is an INDEX into the front-end palette (0..15, a backend check
 * constraint), not a CSS string: see `@/components/colors`.
 *
 * A `type`, for the implicit index signature `RelationRecord` needs.
 */
export type DocumentTagCategoryRow = {
  /** A ULID. */
  id: string
  name: string
  sequence: number
  color: number
}

export const DOCUMENT_TAG_CATEGORY_LIST_FIELDS = [
  'id',
  'name',
  'sequence',
  'color',
] as const satisfies readonly (keyof DocumentTagCategoryRow)[]

/** A `type`, for the implicit index signature `ListFilters` needs. */
export type DocumentTagCategoryFilters = {
  /** Matches the name, case-insensitive. */
  search?: string | null
}

/**
 * EVERY category, in the backend's default order (`sequence`, then `name`).
 *
 * The tree screen is not paged: a category is a handful of rows that each
 * expand into a paged list of their own, and a paginator above expandable rows
 * would page the parents while the children page on their own. `fetchAllPages`
 * stops at its cap, far beyond any real taxonomy.
 */
export function listAllDocumentTagCategories(
  filters: DocumentTagCategoryFilters,
  signal?: AbortSignal,
): Promise<DocumentTagCategoryRow[]> {
  return fetchAllPages<DocumentTagCategoryRow>(
    PATH,
    DOCUMENT_TAG_CATEGORY_LIST_FIELDS,
    { filters },
    signal,
  )
}

/** The loader of a category dropdown: `RelationFetch` shaped. */
export function searchDocumentTagCategories(
  search: string | null,
  signal?: AbortSignal,
): Promise<DocumentTagCategoryRow[]> {
  return listAllDocumentTagCategories({ search }, signal)
}

/** The labels of a few known categories: `RelationResolve` shaped, for a filter. */
export function documentTagCategoryDisplayNames(
  ids: string[],
  signal?: AbortSignal,
): Promise<DocumentTagCategoryRow[]> {
  return fetchDisplayNames<DocumentTagCategoryRow>(PATH, ids, signal)
}

/** The detail carries nothing the row does not. */
export type DocumentTagCategoryDetail = DocumentTagCategoryRow

export function fetchDocumentTagCategory(
  id: string,
  signal?: AbortSignal,
): Promise<DocumentTagCategoryDetail> {
  return apiFetch<DocumentTagCategoryDetail>(detailPath(id), { signal })
}

export interface DocumentTagCategoryCreatePayload {
  name: string
  /** Defaults to 0 server-side, the first palette entry. */
  color?: number
}

export function createDocumentTagCategory(
  payload: DocumentTagCategoryCreatePayload,
): Promise<DocumentTagCategoryDetail> {
  return postJson<DocumentTagCategoryDetail>(PATH, payload)
}

/** The values a new one starts with: see `fetchDefaultValues`. */
export function fetchDocumentTagCategoryDefaults(
  signal?: AbortSignal,
): Promise<Partial<DocumentTagCategoryDetail>> {
  return fetchDefaultValues<DocumentTagCategoryDetail>(PATH, signal)
}

/** A PATCH body, and only the edited keys: see the PATCH asymmetry in users.ts. */
export type DocumentTagCategoryUpdatePayload = Partial<DocumentTagCategoryCreatePayload>

export function updateDocumentTagCategory(
  id: string,
  payload: DocumentTagCategoryUpdatePayload,
): Promise<DocumentTagCategoryDetail> {
  return patchJson<DocumentTagCategoryDetail>(detailPath(id), payload)
}

/**
 * Refused while the category still holds tags -- the backend's foreign key is
 * PROTECT, so deleting a category can never silently take its tags and their
 * links to the documents with it. The refusal is the caller's banner.
 */
export function deleteDocumentTagCategory(id: string): Promise<void> {
  return apiDelete(detailPath(id))
}
