/**
 * The sidebar menu, declared as data.
 *
 * Items carrying a `permission` disappear when the user's token does not grant
 * it, and a section with no visible item disappears entirely -- so the menu
 * never advertises a page that would answer 403. The route guard enforces the
 * same permission; this only keeps the menu honest.
 */

export interface MenuItem {
  label: string
  icon: string
  to: string
  /** OAuth scope required to see this entry. */
  permission?: string
}

export interface MenuSection {
  label: string
  icon: string
  items: MenuItem[]
}

export const menu: MenuSection[] = [
  {
    label: 'Home',
    icon: 'pi pi-home',
    items: [{ label: 'Dashboard', icon: 'pi pi-chart-bar', to: '/dashboard' }],
  },
  {
    label: 'Settings',
    icon: 'pi pi-cog',
    items: [
      {
        label: 'Users',
        icon: 'pi pi-users',
        to: '/settings/users',
        permission: 'totem.user.read',
      },
    ],
  },
]
