<script setup lang="ts">
import { computed } from 'vue'

import { useAuthStore } from '@/auth/authStore'

import { menu, type MenuSection } from './menu'

const auth = useAuthStore()

// A section is dropped once every one of its items is hidden, so the sidebar
// never shows an empty heading.
const visibleSections = computed<MenuSection[]>(() =>
  menu
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.permission || auth.scopes.has(item.permission)),
    }))
    .filter((section) => section.items.length > 0),
)
</script>

<template>
  <nav class="menu">
    <template v-for="section in visibleSections" :key="section.label">
      <div class="menu__section">
        <i :class="section.icon" />
        <span>{{ section.label }}</span>
      </div>

      <ul class="menu__items">
        <li v-for="item in section.items" :key="item.to">
          <RouterLink :to="item.to" class="menu__link">
            <i :class="item.icon" />
            <span>{{ item.label }}</span>
          </RouterLink>
        </li>
      </ul>
    </template>
  </nav>
</template>
