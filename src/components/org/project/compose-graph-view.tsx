import { Fragment } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { StatusDot } from '@/components/ui'
import { Link, type Href } from 'expo-router'
import Svg, { Path, Polygon, Rect } from 'react-native-svg'
import { serviceStatusTone } from '@/lib/container-status'
import {
  describeComposeGraph,
  type ComposeGraph,
  type ComposeGraphEdge,
  type ComposeGraphNode,
} from '@/lib/compose'
import type { ContainerRecord, ServiceRecord } from '@/lib/instance-api'
import { projectServiceHref } from '@/lib/project-navigation'
import { colors, spacing, webPointer } from '@/lib/theme'

const SERVICE_W = 176
const SERVICE_H = 60
const RESOURCE_W = 116
const RESOURCE_H = 34
const HOSTING_W = 176
const HOSTING_H = 34
const COL_GAP = 18
const ROW_GAP = 34
const PADDING = 18
const ARROW_W = 8
const ARROW_H = 7
const DIAGRAM_MAX_HEIGHT = 480
/** Breathing room between the server frame border and the nodes inside it. */
const FRAME_INSET = 14
/** Space reserved inside the frame top for the `SERVER · name` caption. */
const FRAME_LABEL_H = 18

type PixelRect = { x: number; y: number; w: number; h: number }

function nodeSize(kind: ComposeGraphNode['kind']): { w: number; h: number } {
  if (kind === 'service') return { w: SERVICE_W, h: SERVICE_H }
  if (kind === 'hosting') return { w: HOSTING_W, h: HOSTING_H }
  return { w: RESOURCE_W, h: RESOURCE_H }
}

/** Per-row max node height, plus the topmost row that isn't a hosting node (the frame's start). */
function computeRowHeights(nodes: ComposeGraphNode[]): {
  rowHeights: Map<number, number>
  frameStartRow: number
} {
  const rowHeights = new Map<number, number>()
  let frameStartRow = Number.POSITIVE_INFINITY
  for (const node of nodes) {
    const { h } = nodeSize(node.kind)
    rowHeights.set(node.row, Math.max(rowHeights.get(node.row) ?? 0, h))
    if (node.kind !== 'hosting') {
      frameStartRow = Math.min(frameStartRow, node.row)
    }
  }
  return { rowHeights, frameStartRow }
}

/** Y-offset of each row, plus the frame's top edge and the diagram's overall vertical extent. */
function computeRowTops(
  rows: number,
  rowHeights: Map<number, number>,
  hasFrame: boolean,
  frameStartRow: number,
): { rowTop: Map<number, number>; frameTop: number; bottom: number; totalHeight: number } {
  const rowTop = new Map<number, number>()
  let cursorY = PADDING
  let frameTop = 0
  for (let row = 0; row < rows; row += 1) {
    if (hasFrame && row === frameStartRow) {
      frameTop = cursorY
      cursorY += FRAME_LABEL_H + FRAME_INSET
    }
    rowTop.set(row, cursorY)
    cursorY += (rowHeights.get(row) ?? SERVICE_H) + ROW_GAP
  }
  let bottom = rows > 0 ? cursorY - ROW_GAP : cursorY
  if (hasFrame) bottom += FRAME_INSET
  const totalHeight = rows > 0 ? bottom + PADDING : PADDING * 2
  return { rowTop, frameTop, bottom, totalHeight }
}

/** Absolute pixel rect for every node, plus the rightmost edge overall and within the frame. */
function computeNodeRects(
  nodes: ComposeGraphNode[],
  rowTop: Map<number, number>,
  hasFrame: boolean,
): { rects: Map<string, PixelRect>; maxRight: number; maxFramedRight: number } {
  const rects = new Map<string, PixelRect>()
  let maxRight = 0
  let maxFramedRight = 0
  for (const node of nodes) {
    const { w, h } = nodeSize(node.kind)
    const framedNode = hasFrame && node.kind !== 'hosting'
    const x =
      PADDING + (framedNode ? FRAME_INSET : 0) + node.column * (w + COL_GAP)
    const y = rowTop.get(node.row) ?? PADDING
    rects.set(node.id, { x, y, w, h })
    maxRight = Math.max(maxRight, x + w)
    if (framedNode) maxFramedRight = Math.max(maxFramedRight, x + w)
  }
  return { rects, maxRight, maxFramedRight }
}

/**
 * Absolute pixel rects for every node, plus the canvas size that contains
 * them. When `framed`, everything except the hosting row is wrapped in a
 * mermaid-subgraph-style server frame, so those nodes get an extra inset and
 * the frame rect is returned for the renderer.
 */
function computeLayout(
  graph: ComposeGraph,
  framed: boolean,
): {
  rects: Map<string, PixelRect>
  totalWidth: number
  totalHeight: number
  frame: PixelRect | null
} {
  const { rowHeights, frameStartRow } = computeRowHeights(graph.nodes)
  const hasFrame = framed && Number.isFinite(frameStartRow)

  const { rowTop, frameTop, bottom, totalHeight } = computeRowTops(
    graph.rows,
    rowHeights,
    hasFrame,
    frameStartRow,
  )

  const { rects, maxRight, maxFramedRight } = computeNodeRects(
    graph.nodes,
    rowTop,
    hasFrame,
  )

  const frame: PixelRect | null = hasFrame
    ? {
        x: PADDING,
        y: frameTop,
        w: maxFramedRight + FRAME_INSET - PADDING,
        h: bottom - frameTop,
      }
    : null

  return {
    rects,
    totalWidth: Math.max(maxRight, frame ? frame.x + frame.w : 0) + PADDING,
    totalHeight,
    frame,
  }
}

/** Vertical S-curve between two anchor points. */
function curvePath(x1: number, y1: number, x2: number, y2: number): string {
  const midY = (y1 + y2) / 2
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`
}

function edgeStyle(kind: ComposeGraphEdge['kind']): {
  stroke: string
  strokeWidth: number
  dash?: string
  opacity?: number
} {
  if (kind === 'depends_on') return { stroke: colors.command, strokeWidth: 1.5 }
  if (kind === 'hosting') {
    return { stroke: colors.accent, strokeWidth: 1.2, opacity: 0.8 }
  }
  if (kind === 'volume') {
    return { stroke: colors.textDim, strokeWidth: 1, dash: '4 3' }
  }
  return { stroke: colors.borderChip, strokeWidth: 1, opacity: 0.7 }
}

function GraphEdges({
  graph,
  rects,
}: Readonly<{ graph: ComposeGraph; rects: Map<string, PixelRect> }>) {
  return (
    <>
      {graph.edges.map((edge) => {
        const from = rects.get(edge.from)
        const to = rects.get(edge.to)
        if (!from || !to) return null
        const x1 = from.x + from.w / 2
        const y1 = from.y + from.h
        const x2 = to.x + to.w / 2
        const y2 = to.y
        const style = edgeStyle(edge.kind)
        return (
          <Fragment key={edge.id}>
            <Path
              d={curvePath(x1, y1, x2, y2)}
              fill="none"
              stroke={style.stroke}
              strokeWidth={style.strokeWidth}
              strokeDasharray={style.dash}
              strokeOpacity={style.opacity}
            />
            {edge.kind === 'depends_on' || edge.kind === 'hosting' ? (
              <Polygon
                points={`${x2 - ARROW_W / 2},${y2 - ARROW_H} ${x2 + ARROW_W / 2},${y2 - ARROW_H} ${x2},${y2}`}
                fill={style.stroke}
              />
            ) : null}
          </Fragment>
        )
      })}
    </>
  )
}

function joinPorts(ports: string[] | undefined): string | null {
  if (!ports || ports.length === 0) return null
  const shown = ports.slice(0, 2).join(', ')
  return ports.length > 2 ? `${shown} +${ports.length - 2}` : shown
}

function ServiceNodeOverlay({
  node,
  rect,
  orgId,
  projectId,
  service,
  containers,
  showStatus,
}: Readonly<{
  node: ComposeGraphNode
  rect: PixelRect
  orgId: string
  projectId: string
  service: ServiceRecord | undefined
  containers: ContainerRecord[]
  showStatus: boolean
}>) {
  const tone = showStatus ? serviceStatusTone(containers) : null
  const subtitle = node.image
  const ports = joinPorts(node.ports)
  const kindLabel = node.serviceKind === 'site' ? 'site' : 'service'

  const content = (
    <View
      style={[
        styles.serviceNode,
        { left: rect.x, top: rect.y, width: rect.w, height: rect.h },
      ]}
    >
      <View style={styles.serviceAccent} />
      <View style={styles.serviceBody}>
        <View style={styles.serviceTitleRow}>
          {tone ? (
            <StatusDot size="sm" color={tone.color} />
          ) : null}
          <Text style={styles.serviceName} numberOfLines={1}>
            {node.name}
          </Text>
          <Text style={styles.serviceKind}>{kindLabel}</Text>
        </View>
        {subtitle ? (
          <Text style={styles.serviceSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {ports ? (
          <Text style={styles.servicePorts} numberOfLines={1}>
            {ports}
          </Text>
        ) : null}
      </View>
    </View>
  )

  if (!service) {
    return (
      <View importantForAccessibility="no-hide-descendants">{content}</View>
    )
  }

  const linkLabel = tone ? `${node.name}, ${tone.label}` : node.name
  // Link asChild → Slot rejects style arrays (expo-router).
  const pressableStyle = StyleSheet.flatten([
    webPointer,
    { position: 'absolute' as const, left: 0, top: 0 },
  ])

  return (
    <Link
      href={projectServiceHref(orgId, projectId, service.id) as Href}
      asChild
    >
      <Pressable
        style={pressableStyle}
        accessibilityRole="link"
        accessibilityLabel={linkLabel}
      >
        {content}
      </Pressable>
    </Link>
  )
}

/** Exposure pill above the frame — the hostname routing traffic into a service. */
function HostingNodeOverlay({
  node,
  rect,
}: Readonly<{ node: ComposeGraphNode; rect: PixelRect }>) {
  return (
    <View
      style={[
        styles.hostingNode,
        { left: rect.x, top: rect.y, width: rect.w, height: rect.h },
      ]}
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={styles.hostingName} numberOfLines={1}>
        {node.name}
      </Text>
      <Text style={styles.resourceKind}>hosting</Text>
    </View>
  )
}

function ResourceNodeOverlay({
  node,
  rect,
}: Readonly<{ node: ComposeGraphNode; rect: PixelRect }>) {
  const isVolume = node.kind === 'volume'
  return (
    <View
      style={[
        isVolume ? styles.volumeNode : styles.networkNode,
        { left: rect.x, top: rect.y, width: rect.w, height: rect.h },
      ]}
      importantForAccessibility="no-hide-descendants"
    >
      <Text
        style={isVolume ? styles.volumeName : styles.networkName}
        numberOfLines={1}
      >
        {node.name}
      </Text>
      <Text style={styles.resourceKind}>{isVolume ? 'volume' : 'network'}</Text>
    </View>
  )
}

const LEGEND_ENTRIES = [
  { key: 'service', label: 'Service', swatch: 'legendSwatchService' },
  { key: 'network', label: 'Network', swatch: 'legendSwatchNetwork' },
  { key: 'volume', label: 'Volume', swatch: 'legendSwatchVolume' },
  { key: 'hosting', label: 'Hosting', swatch: 'legendSwatchHosting' },
  { key: 'server', label: 'Server', swatch: 'legendSwatchServer' },
  { key: 'depends', label: 'Depends on', swatch: 'legendLineDependsOn' },
] as const

type LegendKey = (typeof LEGEND_ENTRIES)[number]['key']

/**
 * Diagram key as one quiet hairline pill under the canvas — chrome for the
 * diagram, not a second content block. Node shapes carry their own kind label,
 * so this stays small and muted rather than competing with them. Entries only
 * appear for shapes actually drawn (hosting / server frame are conditional).
 */
function GraphLegend({ hidden }: Readonly<{ hidden: readonly LegendKey[] }>) {
  return (
    <View
      style={styles.legend}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {LEGEND_ENTRIES.filter((entry) => !hidden.includes(entry.key)).map(
        (entry) => (
          <View key={entry.key} style={styles.legendItem}>
            <View style={styles[entry.swatch]} />
            <Text style={styles.legendText}>{entry.label}</Text>
          </View>
        ),
      )}
    </View>
  )
}

/**
 * Mermaid-style flow diagram of a Compose document: hosting hostnames feeding
 * services layered by `depends_on`, plus the networks/volumes they join — all
 * wrapped in a subgraph-style frame naming the server this scope deploys to
 * (or will deploy to) when one is set. SVG renders shapes and edges;
 * absolutely positioned RN views carry the text labels on top (same hybrid
 * pattern as {@link import('../charts/metric-line-chart').MetricLineChart}).
 * Service nodes link to the matching service detail page when one exists.
 */
export function ComposeGraphView({
  graph,
  orgId,
  projectId,
  services,
  containersByService,
  showServiceStatus,
  placementLabel,
}: Readonly<{
  graph: ComposeGraph
  orgId: string
  projectId: string
  services: ServiceRecord[]
  containersByService: Record<string, ContainerRecord[]>
  showServiceStatus: boolean
  /** Effective server for this scope — draws the server frame when set. */
  placementLabel?: string | null
}>) {
  if (graph.nodes.length === 0) return null

  const { rects, totalWidth, totalHeight, frame } = computeLayout(
    graph,
    Boolean(placementLabel),
  )
  const serviceByName = new Map(
    services.map((service) => [service.composeServiceName, service]),
  )
  const hasHosting = graph.nodes.some((node) => node.kind === 'hosting')
  const hiddenLegendKeys: LegendKey[] = []
  if (!hasHosting) hiddenLegendKeys.push('hosting')
  if (!frame) hiddenLegendKeys.push('server')
  const accessibilityLabel = [
    placementLabel ? `Deploys to server ${placementLabel}` : null,
    ...describeComposeGraph(graph),
  ]
    .filter(Boolean)
    .join('. ')

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        style={styles.hScroll}
        contentContainerStyle={[styles.hScrollContent, { minWidth: totalWidth }]}
        accessibilityLabel={`Compose diagram. ${accessibilityLabel}`}
      >
        <ScrollView
          nestedScrollEnabled
          style={{ maxHeight: Math.min(totalHeight, DIAGRAM_MAX_HEIGHT) }}
          contentContainerStyle={[
            styles.vScrollContent,
            { minHeight: totalHeight },
          ]}
        >
          <View style={{ width: totalWidth, height: totalHeight }}>
            <Svg
              width={totalWidth}
              height={totalHeight}
              style={StyleSheet.absoluteFill}
            >
              {frame ? (
                <Rect
                  x={frame.x}
                  y={frame.y}
                  width={frame.w}
                  height={frame.h}
                  rx={12}
                  fill={colors.bgInset}
                  fillOpacity={0.4}
                  stroke={colors.borderSubtle}
                  strokeWidth={1}
                />
              ) : null}
              <GraphEdges graph={graph} rects={rects} />
            </Svg>
            {frame && placementLabel ? (
              <View
                style={[
                  styles.frameLabel,
                  { left: frame.x + 12, top: frame.y + 5 },
                ]}
                importantForAccessibility="no-hide-descendants"
              >
                <Text style={styles.frameLabelKind}>server</Text>
                <Text style={styles.frameLabelName} numberOfLines={1}>
                  {placementLabel}
                </Text>
              </View>
            ) : null}
            {graph.nodes.map((node) => {
              const rect = rects.get(node.id)
              if (!rect) return null
              if (node.kind === 'service') {
                const service = serviceByName.get(node.name)
                return (
                  <ServiceNodeOverlay
                    key={node.id}
                    node={node}
                    rect={rect}
                    orgId={orgId}
                    projectId={projectId}
                    service={service}
                    containers={service ? containersByService[service.id] ?? [] : []}
                    showStatus={showServiceStatus}
                  />
                )
              }
              if (node.kind === 'hosting') {
                return <HostingNodeOverlay key={node.id} node={node} rect={rect} />
              }
              return <ResourceNodeOverlay key={node.id} node={node} rect={rect} />
            })}
          </View>
        </ScrollView>
      </ScrollView>
      <GraphLegend hidden={hiddenLegendKeys} />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', gap: spacing.sm },
  hScroll: { maxWidth: '100%' },
  // Centre a diagram narrower than the surface instead of pinning it left.
  hScrollContent: { flexGrow: 1, justifyContent: 'center' },
  vScrollContent: { flexGrow: 1, justifyContent: 'center' },
  serviceNode: {
    position: 'absolute',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    overflow: 'hidden',
  },
  serviceAccent: {
    height: 3,
    backgroundColor: colors.command,
  },
  serviceBody: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    justifyContent: 'center',
    gap: 2,
  },
  serviceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    flexShrink: 0,
  },
  serviceName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  serviceKind: {
    marginLeft: 'auto',
    color: colors.textFaint,
    fontSize: 8,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  serviceSubtitle: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: 'monospace',
  },
  servicePorts: {
    color: colors.textDim,
    fontSize: 10,
    fontFamily: 'monospace',
  },
  networkNode: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.command,
    backgroundColor: colors.bgInset,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  networkName: {
    color: colors.textChip,
    fontSize: 11,
    fontWeight: '600',
  },
  volumeNode: {
    position: 'absolute',
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.textDim,
    backgroundColor: colors.bgInset,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  volumeName: {
    color: colors.textChip,
    fontSize: 11,
    fontWeight: '600',
  },
  hostingNode: {
    position: 'absolute',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.bgInset,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    paddingHorizontal: 8,
  },
  hostingName: {
    color: colors.textChip,
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  resourceKind: {
    color: colors.textFaint,
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  frameLabel: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  frameLabelKind: {
    color: colors.textFaint,
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  frameLabelName: {
    color: colors.textChip,
    fontSize: 11,
    fontWeight: '600',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: spacing.md,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgInset,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendSwatchService: {
    width: 10,
    height: 7,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
  },
  legendSwatchNetwork: {
    width: 10,
    height: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.command,
    backgroundColor: colors.bgInset,
  },
  legendSwatchVolume: {
    width: 10,
    height: 7,
    borderRadius: 2,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.textDim,
    backgroundColor: colors.bgInset,
  },
  legendSwatchHosting: {
    width: 10,
    height: 7,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.bgInset,
  },
  legendSwatchServer: {
    width: 12,
    height: 8,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgInset,
  },
  legendLineDependsOn: {
    width: 14,
    height: 0,
    borderTopWidth: 1.5,
    borderColor: colors.command,
  },
  legendText: {
    color: colors.textDim,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
})
