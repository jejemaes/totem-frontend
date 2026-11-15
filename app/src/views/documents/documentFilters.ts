/*
 * The filters of the documents, declared once for the two views that show
 * them -- the list and the cards.
 *
 * ONE declaration on purpose, as userFilters.ts: the two views read the same
 * query string, and a filter offered by one and not the other would sit in the
 * URL doing nothing after a switch, or be silently dropped by the next write.
 */

import type { FilterFields } from '@/components/filters/filters'
import { contactDisplayNames, displayContact, searchContacts } from '@/resources/contacts'
import { DOCUMENT_TYPE_CHOICES } from '@/resources/documents'
import {
  documentTagCategoryDisplayNames,
  searchDocumentTagCategories,
} from '@/resources/documentTagCategories'
import { documentTagDisplayNames, searchDocumentTags } from '@/resources/documentTags'

/**
 * Keyed by the query parameter the API takes and the one that ends up in the
 * URL. Every relation is a backend `MultiValue`, hence `many2many_tags`.
 */
export const DOCUMENT_FILTER_FIELDS: FilterFields = {
  search: {
    type: 'string',
    label: 'Search',
    help_text: 'Matches the name.',
  },
  tag: {
    type: 'many2one',
    widget: 'many2many_tags',
    label: 'Tags',
    help_text: 'Keep the documents carrying ANY of these tags.',
    options: {
      fetch: searchDocumentTags,
      resolve: documentTagDisplayNames,
      permission: 'totem.documenttag.read',
    },
  },
  tag_category: {
    type: 'many2one',
    widget: 'many2many_tags',
    label: 'Tag categories',
    help_text: 'Keep the documents carrying a tag of any of these categories.',
    options: {
      fetch: searchDocumentTagCategories,
      resolve: documentTagCategoryDisplayNames,
      permission: 'totem.documenttagcategory.read',
    },
  },
  contact: {
    type: 'many2one',
    widget: 'many2many_tags',
    label: 'Contact',
    help_text: 'Keep the documents about these contacts.',
    // The backend's `contact` takes `null` (`allow_null` left on), and a
    // document filed under no one is a question worth asking.
    allowNull: true,
    nullLabel: 'No contact',
    options: {
      fetch: searchContacts,
      resolve: contactDisplayNames,
      relationDisplay: displayContact,
      permission: 'totem.contact.read',
    },
  },
  document_type: {
    type: 'selection',
    widget: 'many2many_tags',
    label: 'Type',
    help_text: 'Keep the uploaded files, or the texts written here.',
    options: { choices: [...DOCUMENT_TYPE_CHOICES] },
  },
  mimetype: {
    type: 'string',
    label: 'Mimetype',
    help_text: 'The start of the mimetype: “image/” for every image, “application/pdf”…',
  },
}
