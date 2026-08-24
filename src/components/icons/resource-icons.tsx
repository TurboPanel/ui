import Svg, { Path } from 'react-native-svg'

type ResourceIconProps = Readonly<{
  size?: number
  color: string
}>

/**
 * Compose resource glyphs for count tiles and inline labels. Stroke-only at
 * 1.75 on a 24 viewbox so they sit at the same weight as the nav icons in
 * `src/components/org/compose-view-icons.tsx`.
 */

/** Stacked layers — an environment (one deployable copy of the project). */
export function EnvironmentResourceIcon({ size = 16, color }: ResourceIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 3.75 21 8.25 12 12.75 3 8.25l9-4.5Z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
      <Path
        d="m3.75 12.75 8.25 4.125 8.25-4.125M3.75 16.875 12 21l8.25-4.125"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

/** Hub and spokes — a compose network. */
export function NetworkResourceIcon({ size = 16, color }: ResourceIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 14.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5ZM5.25 6.75a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM18.75 6.75a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM12 20.25a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
      <Path
        d="m6.3 6.3 4.2 4.2M17.7 6.3l-4.2 4.2M12 14.25v3"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
    </Svg>
  )
}

/** Dashed drum — a compose volume (matches the diagram's dashed volume node). */
export function VolumeResourceIcon({ size = 16, color }: ResourceIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 8.25c3.314 0 6-.895 6-2s-2.686-2-6-2-6 .895-6 2 2.686 2 6 2Z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
      <Path
        d="M18 6.25v11.5c0 1.105-2.686 2-6 2s-6-.895-6-2V6.25"
        stroke={color}
        strokeWidth={1.75}
        strokeDasharray="2.5 2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

/** Drive bay with an activity dot — provisioned storage on a server. */
export function StorageResourceIcon({ size = 16, color }: ResourceIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4.5 6.75h15a1.5 1.5 0 0 1 1.5 1.5v7.5a1.5 1.5 0 0 1-1.5 1.5h-15a1.5 1.5 0 0 1-1.5-1.5v-7.5a1.5 1.5 0 0 1 1.5-1.5Z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
      <Path
        d="M6.75 12h7.5"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
      <Path
        d="M17.25 12h.008"
        stroke={color}
        strokeWidth={2.25}
        strokeLinecap="round"
      />
    </Svg>
  )
}

/** Chain link — a service binding between environments. */
export function BindingResourceIcon({ size = 16, color }: ResourceIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10.5 13.5a3.75 3.75 0 0 0 5.653.405l2.25-2.25a3.75 3.75 0 0 0-5.303-5.303l-1.29 1.283"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M13.5 10.5a3.75 3.75 0 0 0-5.653-.405l-2.25 2.25a3.75 3.75 0 0 0 5.303 5.303l1.283-1.283"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
