<script setup lang="ts">
import Message from 'primevue/message'
import Select from 'primevue/select'
import { computed, useId } from 'vue'

import FieldWrapper from './FieldWrapper.vue'
import type { FieldValue, WidgetProps } from './types'
import { normaliseChoices } from './values'

const props = defineProps<WidgetProps>()
const emit = defineEmits<{ 'update:modelValue': [value: FieldValue] }>()

const inputId = useId()

/*
 * Collision de noms à garder en tête : notre prop `options` est la
 * configuration libre du champ, alors que la prop `options` de <Select> est la
 * liste des entrées. D'où le renommage en `choices` ici.
 */
const choices = computed(() => normaliseChoices(props.options?.choices))

function onSelect(next: FieldValue): void {
  emit('update:modelValue', next ?? null)
}
</script>

<template>
  <FieldWrapper
    :input-id="inputId"
    :label="label"
    :help="help"
    :required="required"
    :error="error"
  >
    <Select
      v-if="choices.length"
      :input-id="inputId"
      fluid
      :options="choices"
      option-label="label"
      option-value="value"
      :model-value="modelValue"
      :show-clear="!required"
      :disabled="readonly"
      :invalid="invalid"
      :placeholder="options?.placeholder ?? 'Sélectionner…'"
      @update:model-value="onSelect"
    />
    <!-- Une liste vide est un défaut de configuration, pas un état normal :
         mieux vaut le dire que rendre un menu déroulant inutilisable. -->
    <Message v-else severity="warn" :closable="false">
      Aucun choix configuré&nbsp;: renseignez <code>options.choices</code>.
    </Message>
  </FieldWrapper>
</template>
