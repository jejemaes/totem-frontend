import { describe, expect, it } from 'vitest'

import {
  EMPTY_HTML,
  hasWidgetMarker,
  htmlOrNull,
  imageAltFromName,
  isEmptyHtml,
  normaliseLinkHref,
  sameHtml,
  tagNames,
  tagsDroppedBy,
  toEditorContent,
} from './html'
import { isEmpty } from './values'

describe('isEmptyHtml', () => {
  it.each([
    ['the empty string', ''],
    ['null', null],
    ['undefined', undefined],
  ])('reads %s as empty', (_label, value) => {
    expect(isEmptyHtml(value)).toBe(true)
  })

  // The case the whole module exists for: ProseMirror always keeps at least one
  // block node, so an untouched editor serialises to this and a cleared one to
  // "<p><br></p>". `isEmpty` in values.ts reads both as FILLED.
  it.each([
    ['an untouched document', EMPTY_HTML],
    ['a cleared document', '<p><br></p>'],
    ['a cleared document, self-closed', '<p><br/></p>'],
    ['a cleared document, spaced', '<p><br /></p>'],
    ['a stack of empty paragraphs', '<p></p><p></p>'],
    ['a paragraph of one nbsp entity', '<p>&nbsp;</p>'],
    ['a paragraph of one nbsp code point', '<p>\u00a0</p>'],
    ['a paragraph of one zero-width space', '<p>\u200b</p>'],
    ['a paragraph of spaces', '<p>   </p>'],
    ['an empty heading', '<h1></h1>'],
  ])('reads %s as empty', (_label, value) => {
    expect(isEmptyHtml(value)).toBe(true)
  })

  it.each([
    ['text', '<p>Hi</p>'],
    ['marked-up text', '<p><strong>Hi</strong></p>'],
    ['escaped markup, which is text', '<p>&lt;p&gt;</p>'],
  ])('reads %s as filled', (_label, value) => {
    expect(isEmptyHtml(value)).toBe(false)
  })

  // These carry no text at all, so the text test alone would call them empty
  // and a `required` field would reject a page that is very much written.
  it.each([
    ['an image', '<p><img src="/x.png"></p>'],
    ['a rule', '<hr>'],
    ['a table', '<table><tbody><tr><td></td></tr></tbody></table>'],
    ['a widget marker', '<t-widget name="last-page"></t-widget>'],
    ['an iframe', '<iframe src="/x"></iframe>'],
  ])('reads %s as filled', (_label, value) => {
    expect(isEmptyHtml(value)).toBe(false)
  })

  // Only a string can be HTML. A number reaching here is a caller bug, and
  // "empty" is the safe reading: it makes `required` complain rather than
  // sending nonsense to the backend.
  it.each([
    ['a number', 12],
    ['a boolean', true],
    ['a list', ['a']],
    ['an object', {}],
  ])('reads %s as empty', (_label, value) => {
    expect(isEmptyHtml(value)).toBe(true)
  })
})

describe('htmlOrNull', () => {
  it.each([
    ['the empty document', EMPTY_HTML],
    ['the empty string', ''],
    ['null', null],
    ['a number', 3],
  ])('maps %s to null', (_label, value) => {
    expect(htmlOrNull(value)).toBeNull()
  })

  // By identity, not by value: what this returns is what gets PATCHed, so
  // nothing here may rewrite the author's markup.
  it('returns a filled document unchanged, by identity', () => {
    const html = '<p>Hi</p>'
    expect(htmlOrNull(html)).toBe(html)
  })
})

/*
 * The property `required` actually rests on. isEmpty is the only predicate
 * Form.vue consults at submit (Form.vue:158), and it knows nothing about HTML --
 * so the two have to agree once htmlOrNull has run.
 */
describe('htmlOrNull composed with isEmpty', () => {
  it.each([
    EMPTY_HTML,
    '<p><br></p>',
    '<p>&nbsp;</p>',
    '',
    '<p>Hi</p>',
    '<hr>',
    '<t-widget name="x"></t-widget>',
  ])('agrees with isEmptyHtml for %s', (html) => {
    expect(isEmpty(htmlOrNull(html))).toBe(isEmptyHtml(html))
  })
})

describe('sameHtml', () => {
  // The watcher's whole reason for existing: the field emits `null` for an empty
  // document while the editor holds "<p></p>", and a plain !== would call
  // setContent on every deletion-to-empty, dropping the caret to the top.
  it('reads every shade of empty as the same document', () => {
    expect(sameHtml(null, EMPTY_HTML)).toBe(true)
    expect(sameHtml('', null)).toBe(true)
    expect(sameHtml('<p><br></p>', EMPTY_HTML)).toBe(true)
    expect(sameHtml(undefined, '<p>   </p>')).toBe(true)
  })

  it('compares two filled documents exactly', () => {
    expect(sameHtml('<p>a</p>', '<p>a</p>')).toBe(true)
    expect(sameHtml('<p>a</p>', '<p>b</p>')).toBe(false)
    expect(sameHtml('<p>Hi</p>', null)).toBe(false)
  })

  // Not a normalising comparison: a trailing byte is still a different value to
  // save, and one of the two is what the PATCH will carry.
  it('does not normalise whitespace between filled documents', () => {
    expect(sameHtml('<p>a</p>', '<p>a</p> ')).toBe(false)
  })
})

describe('toEditorContent', () => {
  it.each([
    ['null', null],
    ['the empty string', ''],
    ['the empty document', EMPTY_HTML],
    ['a list, which is a legal FieldValue', ['a']],
  ])('maps %s to the empty document', (_label, value) => {
    // Never the string "null": ProseMirror would parse it as text.
    expect(toEditorContent(value as never)).toBe(EMPTY_HTML)
  })

  it('passes a filled document through', () => {
    expect(toEditorContent('<p>Hi</p>')).toBe('<p>Hi</p>')
  })
})

describe('tagNames', () => {
  it('collapses closing tags onto their opening name', () => {
    expect([...tagNames('<p>a</p>')]).toEqual(['p'])
  })

  it('does not mistake an attribute for a name', () => {
    expect([...tagNames('<a href="/x">y</a>')]).toEqual(['a'])
  })

  it('lowercases', () => {
    expect([...tagNames('<SECTION></SECTION>')]).toEqual(['section'])
  })

  it('reads a hyphenated custom element', () => {
    expect([...tagNames('<t-widget name="x"></t-widget>')]).toEqual(['t-widget'])
  })

  it.each([['null', null], ['a number', 3]])('answers empty for %s', (_l, value) => {
    expect(tagNames(value).size).toBe(0)
  })
})

describe('tagsDroppedBy', () => {
  // The case that makes replacing widget="text" safe on a live database:
  // <section> is accepted by the backend and unknown to StarterKit.
  it('names an element the editor unwrapped', () => {
    expect(tagsDroppedBy('<section><p>a</p></section>', '<p>a</p>')).toEqual(['section'])
  })

  it('names a widget marker the schema does not carry', () => {
    expect(tagsDroppedBy('<t-widget name="x"></t-widget><p>a</p>', '<p>a</p>')).toEqual([
      't-widget',
    ])
  })

  it('reports nothing when the same tags survive, however rearranged', () => {
    expect(tagsDroppedBy('<p>a</p><p>b</p>', '<p>b</p><p>a</p>')).toEqual([])
    expect(tagsDroppedBy('<ul><li>a</li></ul>', '<ul><li><p>a</p></li></ul>')).toEqual([])
  })

  // A one-way difference: ProseMirror wrapping list text in a <p> has added a
  // tag, not lost one, and warning about that would cry wolf on every page.
  it('does not report added tags', () => {
    expect(tagsDroppedBy('<p>a</p>', '<p>a</p><p>b</p>')).toEqual([])
  })

  /*
   * The marks htmlExtensions.ts re-renders as a styled <span> to get them past
   * the backend's tag whitelist. They vanish from the output by design, and
   * reporting them would flip every page that was ever underlined into source
   * mode on mount.
   */
  it.each([
    ['underline', '<p><u>a</u></p>'],
    ['strike', '<p><s>a</s></p>'],
    ['legacy strike', '<p><strike>a</strike></p>'],
    ['del', '<p><del>a</del></p>'],
  ])('does not report %s, which is re-rendered as a span', (_label, before) => {
    expect(tagsDroppedBy(before, '<p><span style="text-decoration: underline">a</span></p>')).toEqual([])
  })

  it('still reports a real loss alongside a re-rendered mark', () => {
    expect(tagsDroppedBy('<section><u>a</u></section>', '<span>a</span>')).toEqual(['section'])
  })

  it('sorts, so the warning reads the same every time', () => {
    expect(tagsDroppedBy('<video></video><section></section>', '')).toEqual([
      'section',
      'video',
    ])
  })

  it.each([['before', null, '<p>a</p>'], ['after', '<p>a</p>', null]])(
    'answers empty when %s is not a string',
    (_label, before, after) => {
      expect(tagsDroppedBy(before, after)).toEqual([])
    },
  )
})

describe('normaliseLinkHref', () => {
  it('adds https to a bare host, which would otherwise resolve under /tabou/', () => {
    expect(normaliseLinkHref('example.com/a')).toBe('https://example.com/a')
  })

  it.each([
    ['an absolute url', 'https://x.test'],
    ['a mailto', 'mailto:a@b.c'],
    ['a tel', 'tel:+3212345678'],
    ['a site-relative path', '/tabou/pages'],
    ['a fragment', '#anchor'],
  ])('leaves %s alone', (_label, href) => {
    expect(normaliseLinkHref(href)).toBe(href)
  })

  it('trims before deciding', () => {
    expect(normaliseLinkHref('  example.com  ')).toBe('https://example.com')
  })

  // The backend does NOT check an href's value -- `href` is in lxml's
  // safe_attrs -- so this is the only place an honest mistake is caught.
  it.each([
    ['javascript', 'javascript:alert(1)'],
    ['javascript, mixed case and padded', '  JavaScript:alert(1)'],
    ['a data uri', 'data:text/html,x'],
    ['vbscript', 'vbscript:x'],
  ])('refuses %s', (_label, href) => {
    expect(normaliseLinkHref(href)).toBeNull()
  })

  it.each([['the empty string', ''], ['whitespace', '   '], ['a number', 3]])(
    'refuses %s',
    (_label, href) => {
      expect(normaliseLinkHref(href)).toBeNull()
    },
  )
})

describe('hasWidgetMarker', () => {
  it('finds a marker', () => {
    expect(hasWidgetMarker('<p>a</p><t-widget name="x"></t-widget>')).toBe(true)
    expect(hasWidgetMarker('<T-WIDGET></T-WIDGET>')).toBe(true)
  })

  it('does not match a longer name or an escaped one', () => {
    expect(hasWidgetMarker('<t-widgetish></t-widgetish>')).toBe(false)
    expect(hasWidgetMarker('&lt;t-widget&gt;')).toBe(false)
    expect(hasWidgetMarker(null)).toBe(false)
  })
})

describe('imageAltFromName', () => {
  it('reads a file name as words', () => {
    expect(imageAltFromName('team-photo_2.PNG')).toBe('team photo 2')
  })

  it('drops any path', () => {
    expect(imageAltFromName('a/b/c.jpg')).toBe('c')
  })

  it.each([['the empty string', ''], ['a bare extension', '.png'], ['null', null]])(
    'answers empty for %s',
    (_label, name) => {
      expect(imageAltFromName(name)).toBe('')
    },
  )
})
