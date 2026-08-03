import Svg, { Path } from 'react-native-svg'

type TrashIconProps = Readonly<{
  size?: number
  color: string
}>

/** Outline trash can — destructive delete control. */
export function TrashIcon({ size = 20, color }: TrashIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.75 6.75h16.5"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
      <Path
        d="M9.75 6.75V5.25a1.5 1.5 0 0 1 1.5-1.5h1.5a1.5 1.5 0 0 1 1.5 1.5v1.5"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M18.375 6.75v12a1.5 1.5 0 0 1-1.5 1.5h-9.75a1.5 1.5 0 0 1-1.5-1.5v-12"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M10.125 11.25v4.5M13.875 11.25v4.5"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
    </Svg>
  )
}
