import { describe, expect, it } from 'vitest'

import { fileRefusal, filesRefusal, singleFile } from './fileInput'

describe('fileRefusal', () => {
  it('accepts a file up to the limit, inclusive', () => {
    expect(fileRefusal({ size: 1024 }, 1024)).toBeNull()
  })

  it('refuses a larger one, naming both sizes', () => {
    expect(fileRefusal({ size: 3 * 1024 * 1024 }, 2 * 1024 * 1024)).toBe(
      'This file is 3 MB; the limit is 2 MB.',
    )
  })

  it('has no limit of its own', () => {
    expect(fileRefusal({ size: 10 ** 12 })).toBeNull()
  })
})

describe('singleFile', () => {
  it('keeps the one file', () => {
    expect(singleFile(['a'])).toBe('a')
  })

  it('keeps none of several, and none of nothing', () => {
    expect(singleFile(['a', 'b'])).toBeNull()
    expect(singleFile([])).toBeNull()
    expect(singleFile(null)).toBeNull()
  })
})

describe('filesRefusal', () => {
  const small = { name: 'a.pdf', size: 10 }
  const big = { name: 'big.pdf', size: 2 * 1024 * 1024 }

  it('accepts a batch within both limits', () => {
    expect(filesRefusal([small, small], 1024, 2)).toBeNull()
  })

  it('refuses too many files, before looking at their sizes', () => {
    expect(filesRefusal([small, small, big], 1024, 2)).toBe(
      '3 files chosen; at most 2 can be uploaded at once.',
    )
  })

  it('names the first file too large', () => {
    expect(filesRefusal([small, big], 1024 * 1024, 20)).toBe(
      '“big.pdf” is 2 MB; the limit is 1 MB per file.',
    )
  })

  it('has no limit of its own', () => {
    expect(filesRefusal([big, big, big])).toBeNull()
  })
})
