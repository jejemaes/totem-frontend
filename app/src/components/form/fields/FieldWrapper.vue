<script setup lang="ts">
import { useId } from 'vue'

/*
 * Le chrome commun aux six widgets : libellé, marqueur « obligatoire », texte
 * d'aide et message d'erreur. Sans lui, les six composants répéteraient
 * exactement le même bloc.
 *
 * Il est utilisé À L'INTÉRIEUR de chaque widget, et non autour du
 * `<component :is>` de Field.vue, pour deux raisons : le `<label for>` doit
 * viser un identifiant que le widget possède, et un groupe de boutons radio
 * n'a pas d'élément focusable unique à viser — d'où le repli sur un `<span>`
 * + `aria-labelledby`.
 */
defineProps<{
  /** Omis par un contrôle sans élément focusable unique (groupe de radios). */
  inputId?: string
  label?: string
  help?: string
  required?: boolean
  /** Message d'erreur ; il masque le texte d'aide tant qu'il est présent. */
  error?: string
}>()

const labelId = useId()
</script>

<template>
  <div class="field">
    <component
      :is="inputId ? 'label' : 'span'"
      v-if="label"
      :id="labelId"
      :for="inputId"
      class="field__label"
    >
      {{ label }}<span v-if="required" class="field__required" aria-hidden="true">&nbsp;*</span>
    </component>

    <slot :label-id="labelId" />

    <small v-if="error" class="field__error">{{ error }}</small>
    <small v-else-if="help" class="field__help">{{ help }}</small>
  </div>
</template>

<style scoped>
.field {
  display: grid;
  gap: 0.35rem;
}

.field__label {
  font-size: 0.9rem;
  color: var(--app-muted);
}

.field__required {
  color: var(--p-red-500);
}

.field__help,
.field__error {
  font-size: 0.85rem;
}

.field__help {
  color: var(--app-muted);
}

.field__error {
  color: var(--p-red-500);
}
</style>
