<script setup lang="ts">
import Button from 'primevue/button'
import Message from 'primevue/message'
import { computed, provide, reactive, ref, toRaw, watch } from 'vue'

import { FORM_CONTEXT, type FormData } from './context'
import type { FieldValue } from './fields/types'
import { isEmpty } from './fields/values'

const props = withDefaults(
  defineProps<{
    /** Valeurs initiales. Jamais mutées : le formulaire travaille sur une copie. */
    data: FormData
    saveLabel?: string
    /** Désactive tous les champs et masque la barre d'actions. */
    readonly?: boolean
    /** Bouton en état chargement, pour un futur appel backend. */
    saving?: boolean
  }>(),
  { saveLabel: 'Enregistrer', readonly: false, saving: false },
)

const emit = defineEmits<{
  /** Un instantané détaché du brouillon, jamais le proxy réactif interne. */
  save: [values: FormData]
}>()

defineSlots<{
  default(props: { draft: Readonly<FormData> }): unknown
  actions?(props: { invalid: boolean }): unknown
}>()

const draft = reactive<FormData>({ ...props.data })

/** Alimenté par les <Field> montés : le formulaire ne peut pas les découvrir
    autrement, ils vivent dans son slot par défaut. */
const requiredNames = reactive(new Set<string>())

/** Les champs obligatoires laissés vides lors du dernier envoi refusé. */
const missing = ref<string[]>([])

const readonly = computed(() => props.readonly || props.saving)

// Watch sur l'IDENTITÉ, surtout pas `deep` : un watch profond écraserait les
// saisies en cours dès que le parent touche son propre objet. Un nouvel objet
// signifie un nouvel enregistrement, donc on ré-amorce le brouillon.
watch(
  () => props.data,
  (next) => {
    for (const key of Object.keys(draft)) delete draft[key]
    Object.assign(draft, next)
    missing.value = []
  },
)

provide(FORM_CONTEXT, {
  values: draft,
  set(name: string, value: FieldValue) {
    draft[name] = value
    // Corriger un champ efface son erreur tout de suite, sans attendre un
    // nouvel envoi.
    if (missing.value.includes(name) && !isEmpty(value)) {
      missing.value = missing.value.filter((entry) => entry !== name)
    }
  },
  register(name: string, defaultValue: FieldValue) {
    // Uniquement si la clé est absente : un `null` présent dans `data` est une
    // valeur réelle (« vide connu ») et ne doit pas être écrasé par le défaut.
    if (!(name in draft)) draft[name] = defaultValue
  },
  setRequired(name: string, required: boolean) {
    if (required) requiredNames.add(name)
    else requiredNames.delete(name)
  },
  unregister(name: string) {
    requiredNames.delete(name)
    missing.value = missing.value.filter((entry) => entry !== name)
  },
  invalid: (name: string) => missing.value.includes(name),
  readonly,
})

function onSubmit(): void {
  missing.value = [...requiredNames].filter((name) => isEmpty(draft[name]))
  if (missing.value.length) return
  emit('save', { ...toRaw(draft) })
}
</script>

<template>
  <!-- novalidate : les bulles natives du navigateur ne doivent pas concurrencer
       nos propres messages. Le <form> est conservé pour que la touche Entrée
       envoie, comme dans LoginView. -->
  <form class="form" novalidate @submit.prevent="onSubmit">
    <div class="form__fields">
      <slot :draft="draft" />
    </div>

    <Message v-if="missing.length" severity="error" :closable="false">
      Veuillez renseigner les champs obligatoires.
    </Message>

    <div v-if="!readonly" class="form__actions">
      <slot name="actions" :invalid="missing.length > 0">
        <Button type="submit" :label="saveLabel" icon="pi pi-check" :loading="saving" />
      </slot>
    </div>
  </form>
</template>

<style scoped>
.form {
  display: grid;
  gap: 1rem;
}

.form__fields {
  display: grid;
  gap: 1rem;
}

.form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
