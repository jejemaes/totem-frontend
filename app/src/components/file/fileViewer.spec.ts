import { describe, expect, it } from 'vitest'

import { fileIcon, fileKind, fileName, resolveMimetype } from './fileViewer'

const SIGNED = '/media/private/account/invoice/2026/11/scan.PDF?signature=abc&expires=1'

describe('fileName', () => {
  it('reads the last segment, without the query', () => {
    expect(fileName(SIGNED)).toBe('scan.PDF')
    expect(fileName('/media/a/invoice%2042.pdf#page=2')).toBe('invoice 42.pdf')
  })

  it('keeps a name it cannot decode', () => {
    expect(fileName('/media/100%.pdf')).toBe('100%.pdf')
  })

  it('answers empty without a URL', () => {
    expect(fileName(null)).toBe('')
    expect(fileName('')).toBe('')
  })
})

describe('resolveMimetype', () => {
  it('prefers the mimetype given, normalised', () => {
    expect(resolveMimetype('Application/PDF; charset=binary', '/x.png')).toBe('application/pdf')
  })

  it('falls back to the extension, whatever its case', () => {
    expect(resolveMimetype(null, SIGNED)).toBe('application/pdf')
    expect(resolveMimetype('', '/a/b.JPG')).toBe('image/jpeg')
  })

  it('answers null for an unknown or missing extension', () => {
    expect(resolveMimetype(null, '/a/b.xyz')).toBeNull()
    expect(resolveMimetype(null, '/a/b')).toBeNull()
    expect(resolveMimetype(null, null)).toBeNull()
  })
})

describe('fileKind', () => {
  it('tells a PDF, an image and anything else apart', () => {
    expect(fileKind('application/pdf', null)).toBe('pdf')
    expect(fileKind('image/png', null)).toBe('image')
    expect(fileKind('image/jpeg', null)).toBe('image')
    expect(fileKind('application/zip', null)).toBe('other')
    expect(fileKind(null, null)).toBe('other')
  })

  it('trusts the mimetype over the extension', () => {
    expect(fileKind('image/png', '/a/b.pdf')).toBe('image')
  })

  it('reads the URL when there is no mimetype', () => {
    expect(fileKind(null, SIGNED)).toBe('pdf')
    expect(fileKind(undefined, '/a/photo.webp?x=1')).toBe('image')
  })

  it('never draws an SVG as an image', () => {
    expect(fileKind('image/svg+xml', null)).toBe('other')
    expect(fileKind(null, '/a/logo.svg')).toBe('other')
  })
})

describe('fileIcon', () => {
  it('picks an icon by type', () => {
    expect(fileIcon('application/pdf', null)).toBe('pi pi-file-pdf')
    expect(fileIcon('image/svg+xml', null)).toBe('pi pi-image')
    expect(
      fileIcon('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', null),
    ).toBe('pi pi-file-excel')
    expect(fileIcon('text/csv', null)).toBe('pi pi-file-excel')
    expect(fileIcon('application/msword', null)).toBe('pi pi-file-word')
    expect(fileIcon('application/zip', null)).toBe('pi pi-file')
    expect(fileIcon(null, null)).toBe('pi pi-file')
  })
})
