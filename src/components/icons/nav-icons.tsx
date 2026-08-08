import type { ReactElement } from 'react'
import Svg, { Path } from 'react-native-svg'
import type { AdminAreaId } from '@/lib/admin-navigation'
import type { OrgAreaId } from '@/lib/org-navigation'

export type NavIconProps = Readonly<{
  size?: number
  color: string
}>

/** Cube / package — Projects. */
export function ProjectsNavIcon({ size = 16, color }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 7.5 12 2.25 3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

/** Database cylinder — Managed. */
export function ManagedNavIcon({ size = 16, color }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4.5 6.75c0 1.657 3.358 3 7.5 3s7.5-1.343 7.5-3-3.358-3-7.5-3-7.5 1.343-7.5 3Z"
        stroke={color}
        strokeWidth={1.75}
      />
      <Path
        d="M4.5 6.75v10.5c0 1.657 3.358 3 7.5 3s7.5-1.343 7.5-3V6.75"
        stroke={color}
        strokeWidth={1.75}
      />
      <Path
        d="M4.5 12c0 1.657 3.358 3 7.5 3s7.5-1.343 7.5-3"
        stroke={color}
        strokeWidth={1.75}
      />
    </Svg>
  )
}

/** Stacked server slots — Servers. */
export function ServersNavIcon({ size = 16, color }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5.25 4.5h13.5A1.5 1.5 0 0 1 20.25 6v3a1.5 1.5 0 0 1-1.5 1.5H5.25A1.5 1.5 0 0 1 3.75 9V6A1.5 1.5 0 0 1 5.25 4.5Z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
      <Path
        d="M5.25 13.5h13.5a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5v-3a1.5 1.5 0 0 1 1.5-1.5Z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
      <Path
        d="M7.5 7.5h.008M7.5 16.5h.008"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  )
}

/** Key — Access. */
export function AccessNavIcon({ size = 16, color }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15.75 5.25a3.75 3.75 0 1 1-4.72 5.73L6.31 15.7a1.5 1.5 0 0 0-.44 1.06v1.99h1.99a1.5 1.5 0 0 0 1.06-.44l.59-.59v-1.5h1.5V15h1.5v-1.28l1.08-1.08A3.75 3.75 0 0 1 15.75 5.25Z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M16.5 9.75h.008"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  )
}

/** Gear — Admin. */
export function AdminNavIcon({ size = 16, color }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

/** Buildings — organization switcher. */
export function OrganizationIcon({ size = 16, color }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.75 21h16.5M5.25 21V8.25l6-3 6 3V21M9 21v-4.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 16.5V21"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M9 9.75h.008M12 9.75h.008M15 9.75h.008M9 13.5h.008M12 13.5h.008M15 13.5h.008"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  )
}

/** User silhouette — account menu. */
export function UserIcon({ size = 16, color }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15.75 7.5a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M4.5 19.5a7.5 7.5 0 0 1 15 0"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

/** Globe — Networking admin. */
export function NetworkingNavIcon({ size = 16, color }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M3.6 9h16.8M3.6 15h16.8M12 3c2.4 2.7 3.6 5.7 3.6 9s-1.2 6.3-3.6 9c-2.4-2.7-3.6-5.7-3.6-9S9.6 5.7 12 3Z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

/** Envelope — Email admin. */
export function EmailNavIcon({ size = 16, color }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.75 6.75A1.5 1.5 0 0 1 5.25 5.25h13.5a1.5 1.5 0 0 1 1.5 1.5v10.5a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5V6.75Z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="m3.75 7.5 7.36 5.15a1.5 1.5 0 0 0 1.78 0L20.25 7.5"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

/** Door with arrow — public sign-up admin. */
export function SignupNavIcon({ size = 16, color }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6A2.25 2.25 0 0 0 5.25 5.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12 12h8.25m0 0-3-3m3 3-3 3"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

/** Lock — Secrets admin. */
export function SecretsNavIcon({ size = 16, color }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M16.5 10.5V7.5a4.5 4.5 0 1 0-9 0v3"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6.75 10.5h10.5A1.5 1.5 0 0 1 18.75 12v7.5a1.5 1.5 0 0 1-1.5 1.5H6.75a1.5 1.5 0 0 1-1.5-1.5V12a1.5 1.5 0 0 1 1.5-1.5Z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

/** Arrow leave — return from admin to org console. */
export function ReturnToInstanceIcon({ size = 16, color }: NavIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

const AREA_ICONS = {
  projects: ProjectsNavIcon,
  managed: ManagedNavIcon,
  servers: ServersNavIcon,
  access: AccessNavIcon,
} as const satisfies Record<OrgAreaId, (props: NavIconProps) => ReactElement>

const ADMIN_AREA_ICONS = {
  networking: NetworkingNavIcon,
  email: EmailNavIcon,
  signup: SignupNavIcon,
  secrets: SecretsNavIcon,
} as const satisfies Record<AdminAreaId, (props: NavIconProps) => ReactElement>

export function OrgAreaIcon({
  areaId,
  size = 16,
  color,
}: NavIconProps & Readonly<{ areaId: OrgAreaId }>) {
  const Icon = AREA_ICONS[areaId]
  return <Icon size={size} color={color} />
}

export function AdminAreaIcon({
  areaId,
  size = 16,
  color,
}: NavIconProps & Readonly<{ areaId: AdminAreaId }>) {
  const Icon = ADMIN_AREA_ICONS[areaId]
  return <Icon size={size} color={color} />
}
