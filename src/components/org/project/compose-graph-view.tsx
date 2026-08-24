import { Fragment } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Link, type Href } from 'expo-router'
import Svg, { Path, Polygon } from 'react-native-svg'
import { webPointer } from '@/components/org/org-panel-styles'
import { serviceStatusTone } from '@/lib/container-status'
import {
  describeComposeGraph,
  type ComposeGraph,
  type ComposeGraphEdge,
  type ComposeGraphNode,
} from '@/lib/compose'
import type { ContainerRecord, ServiceRecord } from '@/lib/instance-api'
import { projectServiceHref } from '@/lib/project-navigation'
import { colors, spacing } from '@/lib/theme'

const SERVICE_W = 176
const SERVICE_H = 60
const RESOURCE_W = 116
const RESOURCE_H = 34
const COL_GAP = 18
const ROW_GAP = 34
const PADDING = 18
const ARROW_W = 8
const ARROW_H = 7
const DIAGRAM_MAX_HEIGHT = 480

type PixelRect = { x: number; y: number; w: number; h: number }

function nodeSize(kind: ComposeGraphNode['kind']): { w: number; h: number } {
  return kind === 'service'
    ? { w: SERVICE_W, h: SERVICE_H }
    : { w: RESOURCE_W, h: RESOURCE_H }
}

/** Absolute pixel rects for every node, plus the canvas size that contains them. */
function computeLayout(graph: ComposeGraph): {
  rects: Map<string, PixelRect>
  totalWidth: number
  totalHeight: number
} {
  const rowHeights = new Map<number, number>()
  for (const node of graph.nodes) {
    const { h } = nodeSize(node.kind)
    rowHeights.set(node.row, Math.max(rowHeights.get(node.row) ?? 0, h))
  }

  const rowTop = new Map<number, number>()
  let cursorY = PADDING
  for (let row = 0; row < graph.rows; row += 1) {
    rowTop.set(row, cursorY)
    cursorY += (rowHeights.get(row) ?? SERVICE_H) + ROW_GAP
  }
  const totalHeight = graph.rows > 0 ? cursorY - ROW_GAP + PADDING : PADDING * 2

  const rects = new Map<string, PixelRect>()
  let maxRight = 0
  for (const node of graph.nodes) {
    const { w, h } = nodeSize(node.kind)
    const x = PADDING + node.column * (w + COL_GAP)
    const y = rowTop.get(node.row) ?? PADDING
    rects.set(node.id, { x, y, w, h })
    maxRight = Math.max(maxRight, x + w)
  }

  return { rects, totalWidth: maxRight + PADDING, totalHeight }
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
            {edge.kind === 'depends_on' ? (
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
  const subtitle = node.image ?? (node.serviceKind === 'traditional-web' ? 'Traditional web' : null)
  const ports = joinPorts(node.ports)

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
            <View
              style={[styles.statusDot, { backgroundColor: tone.color }]}
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          ) : null}
          <Text style={styles.serviceName} numberOfLines={1}>
            {node.name}
          </Text>
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
  { key: 'depends', label: 'Depends on', swatch: 'legendLineDependsOn' },
] as const

/**
 * Diagram key as one quiet hairline pill under the canvas — chrome for the
 * diagram, not a second content block. Node shapes carry their own kind label,
 * so this stays small and muted rather than competing with them.
 */
function GraphLegend() {
  return (
    <View
      style={styles.legend}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {LEGEND_ENTRIES.map((entry) => (
        <View key={entry.key} style={styles.legendItem}>
          <View style={styles[entry.swatch]} />
          <Text style={styles.legendText}>{entry.label}</Text>
        </View>
      ))}
    </View>
  )
}

/**
 * Mermaid-style flow diagram of a Compose document: services layered by
 * `depends_on`, plus the networks/volumes they join. SVG renders shapes and
 * edges; absolutely positioned RN views carry the text labels on top (same
 * hybrid pattern as {@link import('../charts/metric-line-chart').MetricLineChart}).
 * Service nodes link to the matching service detail page when one exists.
 */
export function ComposeGraphView({
  graph,
  orgId,
  projectId,
  services,
  containersByService,
  showServiceStatus,
}: Readonly<{
  graph: ComposeGraph
  orgId: string
  projectId: string
  services: ServiceRecord[]
  containersByService: Record<string, ContainerRecord[]>
  showServiceStatus: boolean
}>) {
  if (graph.nodes.length === 0) return null

  const { rects, totalWidth, totalHeight } = computeLayout(graph)
  const serviceByName = new Map(
    services.map((service) => [service.composeServiceName, service]),
  )
  const accessibilityLabel = describeComposeGraph(graph).join('. ')

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
              <GraphEdges graph={graph} rects={rects} />
            </Svg>
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
              return <ResourceNodeOverlay key={node.id} node={node} rect={rect} />
            })}
          </View>
        </ScrollView>
      </ScrollView>
      <GraphLegend />
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
  resourceKind: {
    color: colors.textFaint,
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
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
