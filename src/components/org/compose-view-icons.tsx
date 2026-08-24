import Svg, { Path } from 'react-native-svg'

type ComposeViewIconProps = Readonly<{
  size?: number
  color: string
}>

/** Outline network graph — Overview (diagram) mode. */
export function ComposeOverviewIcon({ size = 16, color }: ComposeViewIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7.5 7.5h2.25v2.25H7.5V7.5Z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M14.25 14.25H16.5V16.5h-2.25v-2.25Z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M14.25 7.5H16.5v2.25h-2.25V7.5Z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M9.75 9.75 14.25 15"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M9.75 9 14.25 9"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

/** Outline pen — Compose (YAML) mode. */
export function ComposeEditorIcon({ size = 16, color }: ComposeViewIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M16.862 3.487a1.875 1.875 0 0 1 2.651 2.651L8.25 17.4 3.75 18.75l1.35-4.5L16.862 3.487Z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M15.25 5.1 18.9 8.75"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

/** Outline 2×2 squares — Services (form-card) compose mode. */
export function ComposeVisualIcon({ size = 16, color }: ComposeViewIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 8.25V6Z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 8.25 20.25H6A2.25 2.25 0 0 1 3.75 18v-2.25Z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6Z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

/** Globe — Hosting (hostnames / ports / TLS). */
export function ComposeHostingIcon({ size = 16, color }: ComposeViewIconProps) {
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

/** Stacked racks — Servers (placement pin). */
export function ComposeServersIcon({ size = 16, color }: ComposeViewIconProps) {
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

/** Stacked disk platters — Storage (persistent volumes for the scope). */
export function ComposeStorageIcon({ size = 16, color }: ComposeViewIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 7.5c3.728 0 6.75-1.007 6.75-2.25S15.728 3 12 3 5.25 4.007 5.25 5.25 8.272 7.5 12 7.5Z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
      <Path
        d="M18.75 5.25v13.5c0 1.243-3.022 2.25-6.75 2.25s-6.75-1.007-6.75-2.25V5.25"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M18.75 12c0 1.243-3.022 2.25-6.75 2.25S5.25 13.243 5.25 12"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
    </Svg>
  )
}

/** Horizontal sliders — Settings for the active scope. */
export function ComposeSettingsIcon({ size = 16, color }: ComposeViewIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.75 7.5h4.5M12.75 7.5h7.5M3.75 16.5h7.5M15.75 16.5h4.5"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
      <Path
        d="M10.5 7.5a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0ZM18 16.5a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
    </Svg>
  )
}
