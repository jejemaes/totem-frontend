<script setup lang="ts">
/*
 * The document tag categories as a PrimeVue TreeTable: one row per category,
 * which expands into the paged, reorderable list of its tags
 * (DocumentTagListView).
 *
 * Each category node has exactly ONE child, a placeholder whose cell mounts
 * that list. A TreeTable renders a node's children only while it is expanded,
 * so a category's tags are fetched when it is opened and not before -- and the
 * list is the tags' own ListView, paged and draggable, rather than child rows
 * the tree would page with its parents. The TreeTable has no per-row colspan,
 * so the list sits in the expander column, which takes every width the
 * actions column leaves.
 *
 * Not paged nor sorted: a taxonomy is a handful of categories, loaded whole in
 * the backend's own order (`sequence`, then `name`). Router-free like every
 * view: the pencil emits `open`, the page decides it is a route push.
 */
import Button from 'primevue/button'
import Column from 'primevue/column'
import Message from 'primevue/message'
import TreeTable from 'primevue/treetable'
import type { TreeNode } from 'primevue/treenode'
import { computed, onMounted, onScopeDispose, ref, shallowRef } from 'vue'

import { ApiError } from '@/api/client'
import { can } from '@/auth/permissions'
import ColorTag from '@/components/ColorTag.vue'
import DeleteButton from '@/components/list/DeleteButton.vue'
import {
  deleteDocumentTagCategory,
  listAllDocumentTagCategories,
  type DocumentTagCategoryRow,
} from '@/resources/documentTagCategories'

import DocumentTagListView from './DocumentTagListView.vue'

const emit = defineEmits<{
  /** The pencil of a category: what that means is up to the caller. */
  open: [id: string]
  /** Every settled load, so the caller can show the count in its header. */
  loaded: [total: number]
}>()

/** Computeds, not bare `can()` calls: see ContactListView. */
const canUpdate = computed(() => can('totem.documenttagcategory.update'))
const canDelete = computed(() => can('totem.documenttagcategory.delete'))

/** What a node carries: a category row, or the slot of its tags list. */
type NodeData =
  | { kind: 'category'; category: DocumentTagCategoryRow }
  | { kind: 'tags'; categoryId: string }

const categories = shallowRef<DocumentTagCategoryRow[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
/** Kept across reloads: refreshing must not fold every open category. */
const expandedKeys = ref<Record<string, boolean>>({})

const nodes = computed<TreeNode[]>(() =>
  categories.value.map((category) => ({
    key: category.id,
    data: { kind: 'category', category } satisfies NodeData,
    children: [
      {
        key: `${category.id}/tags`,
        data: { kind: 'tags', categoryId: category.id } satisfies NodeData,
        leaf: true,
      },
    ],
  })),
)

/** The race ticket: see useResourceList. A reload landing late must not win. */
let seq = 0
let inFlight: AbortController | null = null
onScopeDispose(() => inFlight?.abort())

async function reload(): Promise<void> {
  const ticket = ++seq
  inFlight?.abort()
  const controller = new AbortController()
  inFlight = controller
  loading.value = true
  error.value = null
  try {
    const rows = await listAllDocumentTagCategories({}, controller.signal)
    if (ticket !== seq) return
    categories.value = rows
    emit('loaded', rows.length)
  } catch (caught) {
    if (ticket !== seq) return
    error.value =
      caught instanceof ApiError ? caught.message : 'Could not load the tag categories.'
  } finally {
    if (ticket === seq) loading.value = false
  }
}

onMounted(() => {
  void reload()
})

const deleteError = ref<string | null>(null)

async function remove(category: DocumentTagCategoryRow): Promise<void> {
  deleteError.value = null
  try {
    await deleteDocumentTagCategory(category.id)
    void reload()
  } catch (caught) {
    // A category still holding tags is refused (PROTECT): this is where the
    // user learns it.
    deleteError.value =
      caught instanceof ApiError ? caught.message : 'This category could not be deleted.'
  }
}

/** The category of a category node, or null on a tags node. TreeNode types
    its `data` as `any`: these two are where it gets a type back. */
function categoryOf(node: TreeNode): DocumentTagCategoryRow | null {
  const data = node.data as NodeData
  return data.kind === 'category' ? data.category : null
}

/** The category whose tags a tags node lists, or null on a category node. */
function tagsOf(node: TreeNode): string | null {
  const data = node.data as NodeData
  return data.kind === 'tags' ? data.categoryId : null
}

defineExpose({ reload })
</script>

<template>
  <div class="tag-tree">
    <Message v-if="error" severity="error" :closable="false">
      <div class="tag-tree__error">
        <span>{{ error }}</span>
        <Button label="Retry" size="small" severity="danger" outlined @click="reload" />
      </div>
    </Message>

    <Message v-if="deleteError" severity="error" closable @close="deleteError = null">
      {{ deleteError }}
    </Message>

    <TreeTable
      v-model:expanded-keys="expandedKeys"
      :value="nodes"
      :loading="loading"
      class="tag-tree__table"
    >
      <template #header>
        <div class="tag-tree__header">
          <Button
            icon="pi pi-refresh"
            text
            rounded
            severity="secondary"
            aria-label="Refresh"
            :loading="loading"
            @click="reload"
          />
        </div>
      </template>

      <template #empty>
        <div class="tag-tree__empty">
          <i class="pi pi-tags" />
          <p>No tag category yet.</p>
        </div>
      </template>

      <Column field="name" header="Category" expander>
        <template #body="{ node }">
          <ColorTag
            v-if="categoryOf(node)"
            :label="categoryOf(node)!.name"
            :color="categoryOf(node)!.color"
          />
          <DocumentTagListView
            v-else-if="tagsOf(node)"
            :category-id="tagsOf(node)!"
            class="tag-tree__tags"
          />
        </template>
      </Column>

      <Column style="width: 1%" body-class="tag-tree__actions">
        <template #body="{ node }">
          <div v-if="categoryOf(node)" class="tag-tree__buttons">
            <Button
              v-if="canUpdate"
              icon="pi pi-pencil"
              text
              rounded
              severity="secondary"
              aria-label="Edit"
              @click="emit('open', String(node.key))"
            />
            <DeleteButton
              v-if="canDelete"
              label="Delete this category?"
              :message="`“${categoryOf(node)!.name}” will be deleted. A category still holding tags cannot be.`"
              @confirm="remove(categoryOf(node)!)"
            />
          </div>
        </template>
      </Column>
    </TreeTable>
  </div>
</template>

<style scoped>
.tag-tree {
  display: grid;
  /* minmax(0, ...): a wide nested table scrolls inside, never pushes out. */
  grid-template-columns: minmax(0, 1fr);
  gap: 0.75rem;
}

.tag-tree__error {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.tag-tree__header {
  display: flex;
  justify-content: flex-end;
}

.tag-tree__buttons {
  display: flex;
  justify-content: flex-end;
  gap: 0.25rem;
  white-space: nowrap;
}

/* The nested list takes the row's width, beside the expander's indent. */
.tag-tree__tags {
  flex: 1;
  min-width: 0;
}

.tag-tree__empty {
  display: grid;
  justify-items: center;
  gap: 0.5rem;
  padding: 2rem 0;
  color: var(--app-muted);
}

.tag-tree__empty i {
  font-size: 1.5rem;
}

.tag-tree__empty p {
  margin: 0;
}
</style>
