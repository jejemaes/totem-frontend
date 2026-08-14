<script setup lang="ts">
import Button from 'primevue/button'

import { useTheme } from '@/composables/useTheme'

const { theme, toggle } = useTheme()
</script>

<template>
  <!-- Used by the routes that must not show the admin chrome: login, the public
       page, and the error pages. -->
  <div class="blank">
    <div class="blank__actions">
      <Button
        text
        rounded
        :aria-label="theme === 'dark' ? 'Thème clair' : 'Thème sombre'"
        :icon="theme === 'dark' ? 'pi pi-sun' : 'pi pi-moon'"
        @click="toggle"
      />
    </div>

    <div class="blank__body">
      <RouterView />
    </div>
  </div>
</template>
