import { describe, expect, it } from 'vitest'

import { isDisplayableImage, type WebsiteMediaRow } from './websiteMedias'

const row = (mimetype: string | null): WebsiteMediaRow => ({
  id: '01H',
  name: 'file',
  content: '/media/public/website/2026/09/file',
  mimetype,
})

describe('isDisplayableImage', () => {
  it('keeps the image types', () => {
    for (const mimetype of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
      expect(isDisplayableImage(row(mimetype))).toBe(true)
    }
  })

  /*
   * `Media` is a general file store, not an image store: the admin files PDFs
   * through the same endpoint and the list route does not filter by type. So
   * the narrowing is the caller's, and this is the line it draws.
   */
  it('drops what an <img> cannot show', () => {
    for (const mimetype of ['application/pdf', 'text/csv', 'video/mp4']) {
      expect(isDisplayableImage(row(mimetype))).toBe(false)
    }
  })

  /*
   * Deliberately kept, not dropped: an unknown mimetype is a row whose NAME had
   * no recognisable extension (that is where the backend guesses it from), not
   * a row known to be something else. A broken thumbnail is a smaller failure
   * than an image the user cannot find.
   */
  it('keeps a row whose type could not be guessed', () => {
    expect(isDisplayableImage(row(null))).toBe(true)
    expect(isDisplayableImage(row(''))).toBe(true)
  })

  it('does not match a type that merely contains "image/"', () => {
    expect(isDisplayableImage(row('application/vnd.image/x'))).toBe(false)
  })
})
