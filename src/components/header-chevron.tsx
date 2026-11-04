import Svg, { Path } from 'react-native-svg'

type HeaderChevronProps = Readonly<{
  size?: number
  color: string
  open?: boolean
}>

/** Compact chevron for header account / org menus. */
export function HeaderChevron({ size = 12, color, open = false }: HeaderChevronProps) {
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

/**
 * Right-pointing chevron for breadcrumb separators. `tight` crops the empty
 * space on both sides so it is only as wide as its stroke: the crumbs around
 * it then set equal gaps on each side.
 */
export function BreadcrumbChevron({
  size = 12,
  color,
  tight = false,
}: Readonly<{
  size?: number
  color: string
  tight?: boolean
}>) {
  return (
    <Svg
      width={tight ? size / 2 : size}
      height={size}
      viewBox={tight ? '3 0 6 12' : '0 0 12 12'}
      fill="none"
    >
      <Path
        d="M4.25 2.5 7.75 6l-3.5 3.5"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}
