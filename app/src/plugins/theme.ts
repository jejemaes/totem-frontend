/*
 * The Totem palette, as a PrimeVue preset derived from Aura.
 *
 * This is the ONE place a colour is written as hex: everything else -- the app
 * chrome in main.css, every scoped style -- reads the `--p-primary-*` and
 * `--p-surface-*` variables PrimeVue generates from it. Overriding Aura's
 * tokens rather than restyling components in CSS is what keeps light and dark
 * consistent: each component already knows which shade to take in each mode.
 *
 * The identity defines five greens and a paper background; a component library
 * needs eleven shades per scale. So the named colours are pinned at the shade
 * whose role matches theirs, and the steps between them are interpolated:
 *
 *   Menthe  #CFEFD9  100  surfaces, highlights
 *   Pousse  #5CC48A  400  accent -- the primary colour in DARK mode
 *   Totem   #1E8A5A  600  action -- the primary colour in LIGHT mode
 *   Forêt   #14513A  800  brand
 *   Humus   #0E2A1F  950  text
 *   Papier  #F5F3EC        the light background (surface 50)
 *
 * Only the LIGHT surfaces are replaced; dark mode keeps Aura's neutral ones.
 *
 * Action sits at 600 rather than Aura's default 500 because white text on
 * Pousse fails contrast; on Totem it holds.
 */
import { definePreset } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'

const GREEN = {
  50: '#eef9f2',
  100: '#cfefd9',
  200: '#a8e0bc',
  300: '#80d19f',
  400: '#5cc48a',
  500: '#36a671',
  600: '#1e8a5a',
  700: '#196e49',
  800: '#14513a',
  900: '#113d2c',
  950: '#0e2a1f',
}

/*
 * Light surfaces: warm neutrals running from Papier down to Humus, so body
 * text (surface 800) and borders keep the identity's green-black undertone
 * instead of Aura's blue-grey slate.
 */
const PAPER = {
  0: '#ffffff',
  50: '#f5f3ec',
  100: '#ece9e0',
  200: '#dedad0',
  300: '#c8c5ba',
  400: '#a3a398',
  500: '#7c8078',
  600: '#5c645d',
  700: '#414d46',
  800: '#26372f',
  900: '#163026',
  950: '#0e2a1f',
}

export const TotemPreset = definePreset(Aura, {
  semantic: {
    primary: GREEN,
    colorScheme: {
      light: {
        surface: PAPER,
        primary: {
          color: '{primary.600}',
          contrastColor: '#ffffff',
          hoverColor: '{primary.700}',
          activeColor: '{primary.800}',
        },
        highlight: {
          background: '{primary.100}',
          focusBackground: '{primary.200}',
          color: '{primary.800}',
          focusColor: '{primary.900}',
        },
      },
      // No `surface` here on purpose: dark mode keeps Aura's neutral zinc. A
      // Humus-tinted near-black was tried and read as a green background --
      // the greens stay on the actions and the mark, not on the page.
      dark: {
        primary: {
          color: '{primary.400}',
          contrastColor: '{primary.950}',
          hoverColor: '{primary.300}',
          activeColor: '{primary.200}',
        },
      },
    },
  },
})
