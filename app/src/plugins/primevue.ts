import Aura from '@primeuix/themes/aura'
import type { App } from 'vue'

import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'

import 'primeicons/primeicons.css'

/**
 * PrimeVue 4 theming is CSS-variable based: the preset generates the variables
 * and `darkModeSelector` decides which ancestor class turns them dark. We drive
 * it from a `.app-dark` class on <html> rather than the OS media query, so the
 * user can override their system preference (see @/composables/useTheme).
 */
export function installPrimeVue(app: App): void {
  app.use(PrimeVue, {
    theme: {
      preset: Aura,
      options: {
        darkModeSelector: '.app-dark',
        // Keep PrimeVue's own utilities out of the way of our stylesheet.
        cssLayer: false,
      },
    },
    ripple: true,
  })
  app.use(ToastService)
}
