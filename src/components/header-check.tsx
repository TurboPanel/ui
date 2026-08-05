import Svg, { Path } from 'react-native-svg'

type HeaderCheckProps = Readonly<{
  size?: number
  color: string
}>

/** Compact check for the active org row. */
export function HeaderCheck({ size = 14, color }: HeaderCheckProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <Path
        d="M2.75 7.25 5.75 10.25 11.25 3.75"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
