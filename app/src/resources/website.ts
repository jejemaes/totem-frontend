/*
 * /api/v1/website/websites/ -- the site's own settings: name, headline, SEO
 * meta, main menu, homepage, footer and theme.
 *
 * Named `website.ts` and not `websiteWebsites.ts`: this is the one model where
 * the backend's own `<app><model>` naming folds in on itself, which is why its
 * scopes are `totem.website.*` and not `totem.websitewebsite.*`. The file name
 * follows the scope rather than the path.
 *
 * A SINGLETON, and the resource is shaped by that:
 *
 *  - no list, no create, no delete. The row is provisioned once by the
 *    backend's `populate_system`, and the controller deliberately inherits
 *    neither `CreateMixin` nor `DeleteMixin` -- there is no route to call.
 *  - it is addressed as `/current/`, never by id: a client has no way to know
 *    the pk. Same answer as `/users/me/`.
 *  - hence no `Row`/`Filters`/`?fields=` and no `fetchList` here. There is one
 *    record, and `XxxDetail` is all it needs.
 *
 * Scopes: `totem.website.read` and `totem.website.update`.
 */

import { apiFetch, patchJson } from '@/api/client'

import type { WebsitePageRef } from './websitePages'

/**
 * The main menu as the website nests it: `MenuDisplayNameSchema`, so `id` and
 * `name` and nothing else.
 *
 * NOT `WebsiteMenuRef` -- that is what the menu dropdown fetches, and it also
 * carries `parent_path`. Typing this as that one would promise a key this
 * payload does not have.
 */
export type WebsiteMenuNameRef = {
  id: string
  name: string
}

/**
 * What GET /website/websites/current/ returns.
 *
 * `menu` and `homepage` come back NESTED, like every relation in this API.
 * `theme`, on the other hand, is a BARE id: a theme is code, not a row, and
 * only the selection is stored -- the labels live on `/website/themes/`, see
 * resources/websiteThemes. Same arrangement as `Page.layout`.
 */
export type WebsiteDetail = {
  /** A ULID. There is exactly one, and it is never used to address the row. */
  id: string
  name: string
  headline: string
  meta_authors: string | null
  meta_description: string | null
  menu: WebsiteMenuNameRef | null
  homepage: WebsitePageRef | null
  /** HTML, validated server-side; it accepts `<t-widget>` markers. */
  footer: string | null
  side_bar_content: string | null
  /** The theme id -- `default`, … Non-null, defaulted server-side. */
  theme: string
  /**
   * Values for the options the selected theme declares. Carried so the type
   * describes the payload honestly, and deliberately NOT edited by the
   * configuration screen: its shape is the theme's `option_schema`, which would
   * mean building a form from JSON Schema. See the note in updateCurrentWebsite
   * about what merely SENDING `theme` does to it.
   */
  theme_options: Record<string, unknown>
}

export function fetchCurrentWebsite(signal?: AbortSignal): Promise<WebsiteDetail> {
  // The trailing slash is mandatory, like every path in this app.
  return apiFetch<WebsiteDetail>('/website/websites/current/', { signal })
}

/**
 * A PATCH body, and only the edited keys.
 *
 * There is no create payload to derive this from, so it is spelled out: the
 * update schema is the only write contract this resource has.
 *
 * `name` and `headline` are NOT NULL and NOT BLANK server-side; the four keys
 * typed `| null` really are nullable columns, and an explicit null clears them.
 * `theme` is typed WITHOUT null although the schema accepts it, for the same
 * reason as `WebsitePageCreatePayload.layout`: the column is NOT NULL, so a
 * null would fail at the database rather than at validation.
 *
 * `theme_options` is absent on purpose -- see below.
 */
export interface WebsiteUpdatePayload {
  name?: string
  headline?: string
  meta_authors?: string | null
  meta_description?: string | null
  /** The main menu's id, or null. Relations are written as ids. */
  menu?: string | null
  /** The homepage's id, or null. */
  homepage?: string | null
  footer?: string | null
  side_bar_content?: string | null
  theme?: string
}

/**
 * PATCH /website/websites/current/.
 *
 * THE TRAP, and it is the same shape as `Page.is_published` restamping
 * `date_published`: `WebsiteQuerySet.update` reacts to the MERE PRESENCE of
 * `theme` by resetting `theme_options` to `{}`
 * (`kwargs.setdefault("theme_options", {})`), because stored options are keyed
 * by one theme's `option_schema` and nothing maps them onto another's. So
 * echoing an unchanged `theme` back wipes the options of a theme nobody
 * switched away from. Send `changed`, never the draft -- which is what
 * <Form> emits for exactly this reason.
 *
 * The flip side is why this module exposes no way to send `theme_options`: a
 * screen that edited both would have to send them in the SAME request, since
 * the reset only defers to options present in it.
 */
export function updateCurrentWebsite(payload: WebsiteUpdatePayload): Promise<WebsiteDetail> {
  return patchJson<WebsiteDetail>('/website/websites/current/', payload)
}
