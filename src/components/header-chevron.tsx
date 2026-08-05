import Svg, { Path } from 'react-native-svg'

type HeaderChevronProps = Readonly<{
  size?: number
  color: string
  open?: boolean
}>

/** Compact chevron for header account / org menus. */
export function HeaderChevron({
  size = 12,
  color,
  open = false,
}: HeaderChevronProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      style={open ? { transform: [{ rotate: '180deg' }] } : undefined}
    >
      <Path
        d="M2.5 4.25 6 7.75l3.5-3.5"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
