<script setup lang="ts">
import RadioButton from 'primevue/radiobutton'
import Select from 'primevue/select'
import { computed, useId } from 'vue'

import FieldWrapper from './FieldWrapper.vue'
import type { FieldValue, WidgetProps } from './types'

const props = defineProps<WidgetProps>()
const emit = defineEmits<{ 'update:modelValue': [value: FieldValue] }>()

const groupId = useId()

/**
 * Obligatoire -> deux boutons radio (il n'y a que deux réponses possibles).
 * Facultatif  -> une liste à trois entrées, « Non défini » étant un état réel.
 *
 * `options.display` permet de forcer la forme quand ce couplage ne convient
 * pas : rendre un champ facultatif ne devrait pas changer son contrôle par
 * surprise.
 */
const asRadio = computed(() => {
  const display = props.options?.display
  if (display) return display === 'radio'
  return Boolean(props.required)
})

/** Le `data` peut porter « true » ou 1 : on ramène tout à un booléen ou à null. */
const value = computed<boolean | null>(() => {
  const raw = props.modelValue
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'boolean') return raw
  return raw === 'true' || raw === 1 || raw === '1'
})

/*
 * Sentinelles chaîne, et surtout PAS une option de valeur `null` : PrimeVue
 * traite un modelValue à null comme « rien de sélectionné » et affiche le
 * placeholder, donc une option littéralement valuée null ne s'afficherait
 * jamais comme sélectionnée.
 */
const CHOICES = [
  { value: 'true', label: 'Oui' },
  { value: 'false', label: 'Non' },
  { value: 'unset', label: 'Non défini' },
]

const selected = computed(() => (value.value === null ? 'unset' : String(value.value)))

function onSelect(next: string | null): void {
  emit('update:modelValue', next === null || next === 'unset' ? null : next === 'true')
}

function onRadio(next: boolean): void {
  emit('update:modelValue', next)
}
</script>

<template>
  <FieldWrapper
    :input-id="asRadio ? undefined : groupId"
    :label="label"
    :help="help"
    :required="required"
    :error="error"
    v-slot="{ labelId }"
  >
    <!-- Un groupe de radios n'a pas d'élément focusable unique : le libellé du
         wrapper est un <span> et le groupe le référence par aria-labelledby. -->
    <div v-if="asRadio" class="boolean" role="radiogroup" :aria-labelledby="labelId">
      <div class="boolean__choice">
        <RadioButton
          :input-id="`${groupId}-yes`"
          :name="groupId"
          :value="true"
          :model-value="value"
          :disabled="readonly"
          :invalid="invalid"
          @update:model-value="onRadio"
        />
        <label :for="`${groupId}-yes`">Oui</label>
      </div>

      <div class="boolean__choice">
        <RadioButton
          :input-id="`${groupId}-no`"
          :name="groupId"
          :value="false"
          :model-value="value"
          :disabled="readonly"
          :invalid="invalid"
          @update:model-value="onRadio"
        />
        <label :for="`${groupId}-no`">Non</label>
      </div>
    </div>

    <Select
      v-else
      :input-id="groupId"
      fluid
      :options="CHOICES"
      option-label="label"
      option-value="value"
      :model-value="selected"
      :disabled="readonly"
      :invalid="invalid"
      @update:model-value="onSelect"
    />
  </FieldWrapper>
</template>

<style scoped>
.boolean {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  min-height: 2.5rem;
}

.boolean__choice {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.boolean__choice label {
  cursor: pointer;
}
</style>
