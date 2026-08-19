<script setup lang="ts">
import Message from 'primevue/message'
import { computed, onScopeDispose, watchEffect, type Component } from 'vue'

import { useFormContext } from '@/components/form/context'

import BooleanField from './BooleanField.vue'
import CharField from './CharField.vue'
import FloatField from './FloatField.vue'
import IntegerField from './IntegerField.vue'
import SelectionField from './SelectionField.vue'
import TextField from './TextField.vue'
import type { FieldProps, FieldValue, Widget } from './types'

interface FieldDeclarationProps extends FieldProps {
  /** La clé du dict `data` à laquelle ce champ est lié. */
  name: string
  widget: Widget
}

const props = defineProps<FieldDeclarationProps>()

/**
 * L'unique registre widget -> composant. C'est ce fichier qui charge les six
 * types de champs.
 *
 * Typé `Record<Widget, Component>` à dessein : ajouter un membre à `Widget`
 * sans ajouter le composant ici devient une erreur de compilation, et non un
 * champ blanc à l'exécution.
 */
const WIDGETS: Record<Widget, Component> = {
  string: CharField,
  boolean: BooleanField,
  text: TextField,
  integer: IntegerField,
  float: FloatField,
  selection: SelectionField,
}

const form = useFormContext()

// Synchrone, et non dans onMounted : la valeur par défaut doit être dans le
// brouillon AVANT le premier rendu, sinon le contrôle s'affiche vide puis
// scintille.
form.register(props.name, props.default ?? null)

// watchEffect plutôt qu'un appel unique : `required` peut être une expression
// qui dépend d'un autre champ.
watchEffect(() => form.setRequired(props.name, props.required ?? false))

// Démonter un <Field> (v-if) retire sa contrainte `required`, mais garde sa
// valeur dans le brouillon.
onScopeDispose(() => form.unregister(props.name))

const component = computed<Component | null>(() => WIDGETS[props.widget] ?? null)

const value = computed<FieldValue>(() => form.values[props.name] ?? null)

/** `default` est un mot-clé JS : on l'aliase pour ne pas le nommer en template. */
const defaultValue = computed<FieldValue>(() => props.default ?? null)

/** Le readonly du champ est combiné en OU avec celui du formulaire : ni l'un ni
    l'autre ne peut réactiver un champ que l'autre a verrouillé. */
const readonly = computed(() => (props.readonly ?? false) || form.readonly.value)

const invalid = computed(() => form.invalid(props.name))

// `required` est la seule validation du formulaire, donc le message est unique.
const error = computed(() => (invalid.value ? 'Ce champ est obligatoire.' : undefined))

function onUpdate(next: FieldValue): void {
  form.set(props.name, next)
}
</script>

<template>
  <!-- Les props sont transmises explicitement, et non via v-bind="$props" :
       `name` ne doit pas atteindre le widget (il retomberait en attribut sur
       son noeud racine), et la liste explicite garde la surface transmise
       visible en un seul endroit. -->
  <component
    :is="component"
    v-if="component"
    :model-value="value"
    :label="label"
    :help="help"
    :widget="widget"
    :options="options"
    :required="required"
    :readonly="readonly"
    :default="defaultValue"
    :invalid="invalid"
    :error="error"
    :values="form.values"
    @update:model-value="onUpdate"
  />

  <!-- Un widget inconnu ne peut venir que d'une valeur calculée (le type le
       garantit pour un littéral). Une mauvaise ligne ne doit pas vider la
       page : on le signale sur place. La clé reste enregistrée, donc le champ
       reste dans le payload. -->
  <Message v-else severity="error" :closable="false">
    Widget inconnu «&nbsp;{{ widget }}&nbsp;» pour le champ «&nbsp;{{ name }}&nbsp;».
  </Message>
</template>
