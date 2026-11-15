/*
 * "Discard your changes?" before the user leaves a form with unsaved edits:
 * a menu entry, Cancel, the browser's Back, the record pager -- any navigation
 * away from the record on screen.
 *
 * Router guards rather than a check in each button: the ways out are many
 * (the sidebar, the topbar, a link in a banner, the history), most of them
 * outside the form, and a check per button would miss the next one added.
 * `onBeforeRouteUpdate` covers the same page with another `:id` -- the pager,
 * which vue-router serves by reusing the component, so no Leave guard fires.
 *
 * A reload or a closed tab gets the browser's own `beforeunload` prompt: its
 * wording cannot be ours, but losing the edit in silence would be worse.
 *
 * Never asked on the way to /login: the session is over, the request that
 * would save the edit would answer 401 anyway, and a refusal would leave the
 * user on a page that can no longer load anything.
 */

import { useConfirm } from 'primevue/useconfirm'
import { onScopeDispose } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, type RouteLocationNormalized } from 'vue-router'

export function useLeaveConfirmation(
  /** Read at the moment of leaving: true when there is an edit to lose. */
  mustConfirm: () => boolean,
): void {
  const confirm = useConfirm()

  function ask(to: RouteLocationNormalized): boolean | Promise<boolean> {
    if (to.name === 'login' || !mustConfirm()) return true
    return new Promise((resolve) => {
      confirm.require({
        header: 'Discard your changes?',
        message: 'This record has unsaved changes. They will be lost.',
        icon: 'pi pi-exclamation-triangle',
        rejectProps: { label: 'Cancel', severity: 'secondary', text: true },
        acceptProps: { label: 'Discard', severity: 'danger' },
        accept: () => resolve(true),
        reject: () => resolve(false),
        // Escape or a click outside: staying is the safe answer. A second
        // resolve after accept/reject is a no-op.
        onHide: () => resolve(false),
      })
    })
  }

  onBeforeRouteLeave((to) => ask(to))
  onBeforeRouteUpdate((to) => ask(to))

  function onBeforeUnload(event: BeforeUnloadEvent): void {
    if (mustConfirm()) event.preventDefault()
  }
  window.addEventListener('beforeunload', onBeforeUnload)
  onScopeDispose(() => window.removeEventListener('beforeunload', onBeforeUnload))
}
