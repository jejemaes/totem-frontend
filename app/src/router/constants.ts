/**
 * Kept out of router/index.ts on purpose: the router imports every view, so a
 * view importing the router back would be a circular import.
 */

/** Where a freshly signed-in user lands, and the app's home for the signed in. */
export const HOME_ROUTE = '/dashboard'
