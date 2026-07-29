import Svg, { Path } from 'react-native-svg'

type EyeIconProps = Readonly<{
  size?: number
  color: string
}>

/** Outline eye — “show password”. */
export function EyeIcon({ size = 20, color }: EyeIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2.25 12s3.5-7 9.75-7 9.75 7 9.75 7-3.5 7-9.75 7S2.25 12 2.25 12Z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12 15.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

/** Outline eye with slash — “hide password”. */
export function EyeSlashIcon({ size = 20, color }: EyeIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.5 3.5 20.5 20.5"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
      <Path
        d="M9.88 9.94A3.25 3.25 0 0 0 12 15.25a3.24 3.24 0 0 0 2.98-2.12"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6.7 6.86C4.4 8.35 2.75 10.7 2.25 12c0 0 3.5 7 9.75 7 1.85 0 3.48-.5 4.9-1.25M17.9 15.3c1.55-1.2 2.8-2.85 3.85-3.3 0 0-3.5-7-9.75-7-.7 0-1.37.07-2 .2"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
