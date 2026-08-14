<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <!-- The layout is chosen by the route: AdminLayout for the signed-in area,
       BlankLayout for login and the public/error pages. -->
  <RouterView />
</template>
