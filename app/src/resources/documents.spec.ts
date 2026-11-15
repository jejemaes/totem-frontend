import { describe, expect, it } from 'vitest'

import { documentFormData, documentIcon, documentUploadFormData } from './documents'
import { withCategoryColor } from './documentTags'

describe('documentFormData', () => {
  it('leaves a null out, since a form part cannot carry one', () => {
    const body = documentFormData(
      { document_type: 'text', name: 'Notes', text_content: '<p>Hi</p>', date: null, user: null },
      null,
    )
    expect([...body.keys()]).toEqual(['document_type', 'name', 'text_content'])
    expect(body.get('text_content')).toBe('<p>Hi</p>')
  })

  it('sends one part per tag, and none for an empty list', () => {
    const tagged = documentFormData({ document_type: 'text', name: 'x', tags: ['a', 'b'] }, null)
    expect(tagged.getAll('tags')).toEqual(['a', 'b'])
    const untagged = documentFormData({ document_type: 'text', name: 'x', tags: [] }, null)
    expect(untagged.has('tags')).toBe(false)
  })

  it('puts the file under `file`, only when there is one', () => {
    const file = new Blob(['%PDF'], { type: 'application/pdf' })
    const body = documentFormData({ document_type: 'file' }, file)
    expect(body.get('file')).toBeInstanceOf(Blob)
    expect(body.has('name')).toBe(false)
    expect(documentFormData({ document_type: 'text' }, null).has('file')).toBe(false)
  })
})

describe('documentUploadFormData', () => {
  it('sends one `files` part per file, in order', () => {
    const a = new Blob(['a'])
    const b = new Blob(['b'])
    const body = documentUploadFormData({}, [a, b])
    expect(body.getAll('files')).toHaveLength(2)
    expect([...body.keys()]).toEqual(['files', 'files'])
  })

  it('shares the user, the contact and the tags, leaving a null out', () => {
    const body = documentUploadFormData(
      { user: 'u', contact: null, tags: ['t1', 't2'] },
      [new Blob(['a'])],
    )
    expect(body.get('user')).toBe('u')
    expect(body.has('contact')).toBe(false)
    expect(body.getAll('tags')).toEqual(['t1', 't2'])
  })
})

describe('withCategoryColor', () => {
  it('copies the category colour up to the tag', () => {
    const tag = { id: 't', name: 'Paid', category: { id: 'c', name: 'Status', color: 4 } }
    expect(withCategoryColor(tag).color).toBe(4)
  })

  it('paints neutral without a category', () => {
    const bare: { id: string; category?: null } = { id: 't' }
    expect(withCategoryColor(bare).color).toBeNull()
    expect(withCategoryColor({ ...bare, category: null }).color).toBeNull()
  })
})

describe('documentIcon', () => {
  it('reads the type before the mimetype', () => {
    expect(documentIcon({ document_type: 'text', mimetype: 'text/html' })).toBe('pi pi-align-left')
  })

  it('reads the mimetype of a file', () => {
    expect(documentIcon({ document_type: 'file', mimetype: 'image/png' })).toBe('pi pi-image')
    expect(documentIcon({ document_type: 'file', mimetype: 'application/pdf' })).toBe(
      'pi pi-file-pdf',
    )
  })

  it('falls back to the plain file icon', () => {
    expect(documentIcon({ document_type: 'file', mimetype: null })).toBe('pi pi-file')
    expect(documentIcon({})).toBe('pi pi-file')
  })
})
