import { Link, type Href } from 'expo-router'
import { type ReactNode } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { StatusChip } from '@/components/ui/v4/status-chip'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { webPointer } from '@/lib/theme'
import type { Palette } from '@/lib/theme-palettes'
import {
  type MapColumn,
  type MapHead,
  type MapLayout,
  type MapLineKind,
  type MapNode,
  type MapSegment,
  type MapTarget,
} from '@/lib/v4/map-layout'
import { COMPACT_BREAKPOINT, RADIUS } from '@/lib/v4/ui-scale'

/** Where a station opens, or null when there is nothing to open yet. */
export type StationHref = (target: MapTarget) => string | null

const ICON_PATHS: Readonly<Record<MapNode['kind'], string>> = {
  domain: 'M5 11h14v10H5ZM8 11V8a4 4 0 0 1 8 0v3',
  app: 'M3 4h18v16H3ZM3 9h18',
  store: 'M3 10h5v5H3ZM9.5 10h5v5h-5ZM16 10h5v5h-5ZM9.5 3.5h5v5h-5Z',
  db: 'M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3Zm0 0v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3',
  volume: 'M3 6h18v12H3ZM7 14h.01M11 14h6',
}

const styles = themedStyles((p) => ({
  box: { width: '100%' },
  canvas: { position: 'relative' },
  band: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderLeftWidth: 1,
    borderStyle: 'dashed',
    borderColor: p.sep,
    paddingLeft: 10,
    paddingTop: 8,
  },
  bandLabel: { ...typeStyle('bodySemibold', 'caption'), color: p.text3, textTransform: 'uppercase', letterSpacing: 0.6 },
  bandNote: { ...typeStyle('body', 'caption'), color: p.text3, marginTop: 2 },
  line: { position: 'absolute' },
  head: { position: 'absolute' },
  node: {
    position: 'absolute',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 12,
    borderRadius: RADIUS.row,
    borderWidth: 1,
    borderColor: p.sepStrong,
    backgroundColor: p.surface,
  },
  nodeChanged: { borderColor: p.baseLine, backgroundColor: p.baseSoft },
  nodeRemoved: { borderStyle: 'dashed', opacity: 0.5 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { ...typeStyle('bodySemibold', 'subhead'), color: p.text, flexShrink: 1 },
  bottom: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', gap: 8, overflow: 'hidden' },
  sub: { ...typeStyle('mono', 'caption'), color: p.text3, flexShrink: 1 },
  runs: { ...typeStyle('body', 'caption'), color: p.text3, flexShrink: 1 },
  tag: { ...typeStyle('bodySemibold', 'caption'), color: p.base },
  tagRemoved: { color: p.text3 },
  jobs: { ...typeStyle('body', 'caption'), color: p.text3 },
  rail: { borderLeftWidth: 3, borderColor: p.railData, marginLeft: 6, paddingLeft: 14, gap: 8 },
  section: { gap: 8, marginBottom: 16 },
  rowStation: {
    minHeight: 56,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.row,
    borderWidth: 1,
    borderColor: p.sepStrong,
    backgroundColor: p.surface,
  },
  chip: { ...typeStyle('body', 'caption'), color: p.text3 },
}))

const LINE_COLOR: Readonly<Record<MapLineKind, keyof Palette>> = {
  https: 'railHttps',
  internal: 'railInternal',
  data: 'railData',
}

function Line({ segment }: Readonly<{ segment: MapSegment }>) {
  const p = usePalette()
  const s = styles(p)
  return (
    <View
      accessibilityElementsHidden
      style={[
        s.line,
        { left: segment.x, top: segment.y, width: segment.w, height: segment.h, backgroundColor: p[LINE_COLOR[segment.kind]] },
      ]}
    />
  )
}

function Head({ head }: Readonly<{ head: MapHead }>) {
  const p = usePalette()
  return (
    <View
      accessibilityElementsHidden
      style={[styles(p).head, { left: head.x, top: head.y }]}
    >
      <Svg width={8} height={8} viewBox="0 0 8 8">
        <Path d="M0 0 8 4 0 8Z" fill={p[LINE_COLOR[head.kind]]} />
      </Svg>
    </View>
  )
}

function KindIcon({ kind }: Readonly<{ kind: MapNode['kind'] }>) {
  const p = usePalette()
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path d={ICON_PATHS[kind]} fill="none" stroke={p.text3} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function Tags({ node }: Readonly<{ node: MapNode }>) {
  const s = styles(usePalette())
  return (
    <>
      {node.tags.map((tag) => (
        <Text key={tag} numberOfLines={1} style={[s.tag, node.removed && s.tagRemoved]}>
          {tag}
        </Text>
      ))}
    </>
  )
}

function StationBody({ node }: Readonly<{ node: MapNode }>) {
  const s = styles(usePalette())
  return (
    <>
      <View style={s.top}>
        <KindIcon kind={node.kind} />
        <Text numberOfLines={1} style={s.name}>
          {node.name}
        </Text>
        {node.status ? <StatusChip status={node.status.key} label={node.status.label} size="sm" /> : null}
      </View>
      <View style={s.bottom}>
        {node.sub === '' ? null : (
          <Text numberOfLines={1} style={s.sub}>
            {node.sub}
          </Text>
        )}
        {node.runs === '' ? null : (
          <Text numberOfLines={1} style={s.runs}>
            {node.runs}
          </Text>
        )}
        <Tags node={node} />
        {node.jobsLabel === '' ? null : <Text style={s.jobs}>{node.jobsLabel}</Text>}
      </View>
    </>
  )
}

function Station({ node, href }: Readonly<{ node: MapNode; href: string | null }>) {
  const s = styles(usePalette())
  const style: StyleProp<ViewStyle> = [
    s.node,
    node.changed && s.nodeChanged,
    node.removed && s.nodeRemoved,
    { left: node.x, top: node.y, width: node.w, height: node.h },
  ]
  // The child of `Link asChild` takes one style object on web, never an array.
  const linkStyle = StyleSheet.flatten([style, webPointer])
  if (href === null) {
    return (
      <View accessible accessibilityLabel={node.aria} style={style}>
        <StationBody node={node} />
      </View>
    )
  }
  return (
    <Link href={href as Href} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={node.aria} style={linkStyle}>
        <StationBody node={node} />
      </Pressable>
    </Link>
  )
}

/** The wide form: three bands, stations and lines at the positions the layout gives. */
function WideMap({ layout, hrefFor }: Readonly<{ layout: MapLayout; hrefFor: StationHref }>) {
  const s = styles(usePalette())
  return (
    <ScrollView horizontal style={s.box}>
      <View style={[s.canvas, { width: layout.w, height: layout.h }]}>
        {layout.bands.map((band) => (
          <View key={band.key} style={[s.band, { left: band.x, width: band.w }]}>
            <Text style={s.bandLabel}>{band.label}</Text>
            {band.note === '' ? null : <Text style={s.bandNote}>{band.note}</Text>}
          </View>
        ))}
        {layout.segments.map((segment, index) => (
          <Line key={`${segment.orientation}-${index}`} segment={segment} />
        ))}
        {layout.heads.map((head, index) => (
          <Head key={`head-${index}`} head={head} />
        ))}
        {layout.nodes.map((node) => (
          <Station key={node.id} node={node} href={hrefFor(node.target)} />
        ))}
      </View>
    </ScrollView>
  )
}

function StationRow({ node, href }: Readonly<{ node: MapNode; href: string | null }>) {
  const s = styles(usePalette())
  const body = (
    <>
      <KindIcon kind={node.kind} />
      <Text numberOfLines={1} style={s.name}>
        {node.name}
      </Text>
      {node.status ? <StatusChip status={node.status.key} label={node.status.label} size="sm" /> : null}
      {node.runs === '' ? null : <Text style={s.runs}>{node.runs}</Text>}
      <Tags node={node} />
      {node.connections.map((connection) => (
        <Text key={connection} style={s.chip}>
          {connection}
        </Text>
      ))}
    </>
  )
  if (href === null) {
    return (
      <View accessible accessibilityLabel={node.aria} style={[s.rowStation, node.removed && s.nodeRemoved]}>
        {body}
      </View>
    )
  }
  const linkStyle = StyleSheet.flatten([
    s.rowStation,
    node.changed && s.nodeChanged,
    node.removed && s.nodeRemoved,
    webPointer,
  ])
  return (
    <Link href={href as Href} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={node.aria} style={linkStyle}>
        {body}
      </Pressable>
    </Link>
  )
}

function Lane({ column, hrefFor }: Readonly<{ column: MapColumn; hrefFor: StationHref }>) {
  const s = styles(usePalette())
  return (
    <View style={s.section}>
      <Text accessibilityRole="header" style={s.bandLabel}>
        {column.label}
      </Text>
      {column.nodes.length === 0 ? <Text style={s.bandNote}>{column.emptyText}</Text> : null}
      <View style={s.rail}>
        {column.nodes.map((node) => (
          <StationRow key={node.id} node={node} href={hrefFor(node.target)} />
        ))}
      </View>
    </View>
  )
}

/** The narrow form: Visitors, Apps and Data stacked, a rail down the left, links as chips. */
function StackedMap({ layout, hrefFor }: Readonly<{ layout: MapLayout; hrefFor: StationHref }>) {
  return (
    <View>
      {layout.columns.map((column) => (
        <Lane key={column.key} column={column} hrefFor={hrefFor} />
      ))}
    </View>
  )
}

/**
 * The environment map (ia-v4 section 2). Wide screens get the three bands with
 * lines; narrow ones get the stacked form. Every station is a link with a
 * full spoken description, and the services list under the map repeats it all,
 * so nothing is map-only.
 */
export function EnvironmentMap({
  layout,
  hrefFor,
  legend,
}: Readonly<{ layout: MapLayout; hrefFor: StationHref; legend?: ReactNode }>) {
  const { width } = useWindowDimensions()
  const narrow = width < COMPACT_BREAKPOINT
  return (
    <View accessibilityRole="summary" accessibilityLabel={layout.aria}>
      {narrow ? (
        <StackedMap layout={layout} hrefFor={hrefFor} />
      ) : (
        <WideMap layout={layout} hrefFor={hrefFor} />
      )}
      {legend}
    </View>
  )
}
