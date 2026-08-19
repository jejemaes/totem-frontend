<script setup lang="ts">
import Card from 'primevue/card'
import { ref } from 'vue'

import type { FormData } from '@/components/form/context'
import Field from '@/components/form/fields/Field.vue'
import Form from '@/components/form/Form.vue'

/*
 * Page de démonstration : rien n'est envoyé au backend. Elle sert à lire une
 * définition de formulaire et à voir ce que le composant en fait.
 *
 * Deux clés méritent l'attention :
 *  - `remarque` est ABSENTE : son <Field> porte un `default`, qui remplit donc
 *    le brouillon et se retrouve dans le payload.
 *  - `couleur` vaut `null` : c'est une valeur réelle, le `default` de son
 *    <Field> ne l'écrase PAS.
 */
const data = ref<FormData>({
  nom: 'Totem',
  description: 'Borne d’accueil du hall principal.',
  couleur: null,
  quantite: 12,
  note: 3.14159,
  actif: true,
  publie: null,
  statut: 'draft',
  reference: 'REF-001',
})

const saved = ref<FormData | null>(null)

function onSave(payload: FormData): void {
  saved.value = payload
}

/** Recopie du template ci-dessous, pour que la page se documente elle-même. */
const DEFINITION = `<Form :data="data" @save="onSave">
  <Field name="nom"         widget="string"    label="Nom" required />
  <Field name="description" widget="text"      label="Description" :options="{ rows: 3 }" />
  <Field name="remarque"    widget="string"    label="Remarque" default="Rien à signaler" />
  <Field name="couleur"     widget="selection" label="Couleur" default="bleu"
         :options="{ choices: ['bleu', 'rouge', 'vert'] }" />
  <Field name="quantite"    widget="integer"   label="Quantité" :options="{ min: 0 }" />
  <Field name="note"        widget="float"     label="Note" />
  <Field name="actif"       widget="boolean"   label="Actif" required />
  <Field name="publie"      widget="boolean"   label="Publié" />
  <Field name="statut"      widget="selection" label="Statut"
         :options="{ choices: [
           { value: 'draft', label: 'Brouillon' },
           { value: 'done',  label: 'Terminé' },
         ] }" />
  <Field name="reference"   widget="string"    label="Référence" readonly />
</Form>`
</script>

<template>
  <section class="page">
    <header class="page__header">
      <div>
        <h1>Démo formulaire</h1>
        <p class="page__subtitle">
          Composants <code>Form</code> et <code>Field</code>. Rien n'est envoyé au backend.
        </p>
      </div>
    </header>

    <div class="cards">
      <Card>
        <template #title>Formulaire</template>
        <template #content>
          <Form :data="data" v-slot="{ draft }" @save="onSave">
            <Field name="nom" widget="string" label="Nom" required
                   help="Obligatoire : le vider puis enregistrer affiche l'erreur." />

            <Field name="description" widget="text" label="Description" :options="{ rows: 3 }" />

            <Field name="remarque" widget="string" label="Remarque" default="Rien à signaler"
                   help="Clé absente de `data` : la valeur vient du `default`." />

            <Field name="couleur" widget="selection" label="Couleur" default="bleu"
                   :options="{ choices: ['bleu', 'rouge', 'vert'] }"
                   help="`data` porte null : le `default` ne l'écrase pas." />

            <Field name="quantite" widget="integer" label="Quantité" :options="{ min: 0 }"
                   help="Le séparateur décimal est refusé à la saisie." />

            <Field name="note" widget="float" label="Note"
                   help="Six décimales conservées, pas d'arrondi à deux." />

            <Field name="actif" widget="boolean" label="Actif" required
                   help="Obligatoire, donc boutons radio." />

            <Field name="publie" widget="boolean" label="Publié"
                   help="Facultatif, donc liste Oui / Non / Non défini." />

            <Field name="statut" widget="selection" label="Statut"
                   :options="{ choices: [
                     { value: 'draft', label: 'Brouillon' },
                     { value: 'done', label: 'Terminé' },
                   ] }" />

            <Field name="reference" widget="string" label="Référence" readonly
                   help="Verrouillé, mais bien présent dans le payload." />

            <p class="note">Le brouillon, en direct&nbsp;:</p>
            <pre class="preview">{{ JSON.stringify(draft, null, 2) }}</pre>
          </Form>
        </template>
      </Card>

      <Card>
        <template #title>Dernier événement « save »</template>
        <template #content>
          <pre v-if="saved" class="preview">{{ JSON.stringify(saved, null, 2) }}</pre>
          <p v-else class="note">Aucun enregistrement pour l'instant.</p>

          <h3>Le <code>data</code> d'origine</h3>
          <p class="note">
            Il ne bouge jamais&nbsp;: le formulaire travaille sur une copie.
          </p>
          <pre class="preview">{{ JSON.stringify(data, null, 2) }}</pre>
        </template>
      </Card>

      <Card>
        <template #title>Définition</template>
        <template #content>
          <pre class="preview"><code>{{ DEFINITION }}</code></pre>
        </template>
      </Card>
    </div>
  </section>
</template>

<style scoped>
.preview {
  margin: 0;
  padding: 0.75rem;
  overflow-x: auto;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-bg);
  font-size: 0.8rem;
  line-height: 1.5;
}

h3 {
  margin: 1.5rem 0 0.25rem;
  font-size: 1rem;
}
</style>
