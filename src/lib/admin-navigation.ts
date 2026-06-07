export const ALL_TARGET = '__all__' as const

export const ADMIN_SECTIONS = [
  {
    id: 'fleet',
    label: 'Fleet',
    path: '/admin/fleet',
    hint: 'Instance health and connected agents',
  },
  {
    id: 'network',
    label: 'Network',
    path: '/admin/network',
    hint: 'Interface addresses on physical NICs',
  },
  {
    id: 'shell',
    label: 'Shell',
    path: '/admin/shell',
    hint: 'Run commands on selected servers',
  },
  {
    id: 'connectivity',
    label: 'Connectivity',
    path: '/admin/connectivity',
    hint: 'WebSocket echo and traffic log',
  },
] as const

export type AdminSectionId = (typeof ADMIN_SECTIONS)[number]['id']

export function adminSectionByPath(pathname: string) {
  return ADMIN_SECTIONS.find((section) => pathname === section.path) ?? null
}
