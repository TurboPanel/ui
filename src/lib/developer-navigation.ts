export const ALL_TARGET = '__all__' as const

export const DEVELOPER_SECTIONS = [
  {
    id: 'fleet',
    label: 'Fleet',
    path: '/developer/fleet',
    hint: 'Instance health and connected server nodes',
  },
  {
    id: 'network',
    label: 'Network',
    path: '/developer/network',
    hint: 'Interface addresses on physical NICs',
  },
  {
    id: 'shell',
    label: 'Shell',
    path: '/developer/shell',
    hint: 'Run commands on selected servers',
  },
  {
    id: 'connectivity',
    label: 'Connectivity',
    path: '/developer/connectivity',
    hint: 'WebSocket echo and traffic log',
  },
  {
    id: 'database',
    label: 'Database',
    path: '/developer/database',
    hint: 'Postgres connection test and Drizzle Studio',
  },
  {
    id: 'servers',
    label: 'Servers',
    path: '/developer/servers',
    hint: 'Registered server nodes and organization assignment',
  },
] as const

export type DeveloperSectionId = (typeof DEVELOPER_SECTIONS)[number]['id']

export function developerSectionByPath(pathname: string) {
  return DEVELOPER_SECTIONS.find((section) => pathname === section.path) ?? null
}
