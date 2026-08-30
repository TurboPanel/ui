/**
 * Pure transpilation of a Compose document into a small dependency graph —
 * services (nodes) plus the networks/volumes they join, laid out on an
 * integer row/column grid so a renderer can turn it into a mermaid-style
 * flow diagram. No YAML/UI concerns here; see `compose-graph-view.tsx` for
 * pixel layout + SVG rendering.
 */
import { normalizeCompose } from './types'
import { parseComposeImageRef } from './image-ref'
import { readServiceTurbopanelExtension, type ComposeServiceKind } from './service-kind'

export type ComposeGraphNodeKind = 'service' | 'network' | 'volume' | 'hosting'

export type ComposeGraphNode = {
  id: string
  kind: ComposeGraphNodeKind
  /** Raw Compose key (service/network/volume name), or the hostname for hosting nodes. */
  name: string
  /** Grid row — hosting sits above every service; services are layered by `depends_on`; networks/volumes sit in the row below all services. */
  row: number
  /** Position within the row, in original definition order. */
  column: number
  image?: string
  serviceKind?: ComposeServiceKind
  ports?: string[]
}

export type ComposeGraphEdgeKind = 'depends_on' | 'network' | 'volume' | 'hosting'

export type ComposeGraphEdge = {
  id: string
  kind: ComposeGraphEdgeKind
  /** Service node id, or the hosting node id for hosting edges (traffic flows in). */
  from: string
  /** Dependency service node id (depends_on), network/volume node id, or the served service node id (hosting). */
  to: string
}

/**
 * Live deployment facts overlaid on the pure compose topology — a hostname
 * per compose service name (first configured hosting row). Everything here is
 * optional; without facts the graph is compose-only, exactly as before.
 */
export type ComposeGraphFacts = Readonly<{
  hostnamesByService?: Readonly<Record<string, string>>
}>

export type ComposeGraph = {
  nodes: ComposeGraphNode[]
  edges: ComposeGraphEdge[]
  columns: number
  rows: number
}

function isPlainObjectMap(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Ordered `[name, entry]` pairs for a top-level compose map, skipping non-map values. */
function mapEntries(value: unknown): [string, Record<string, unknown>][] {
  if (!isPlainObjectMap(value)) return []
  const out: [string, Record<string, unknown>][] = []
  for (const [key, entry] of Object.entries(value)) {
    if (isPlainObjectMap(entry)) out.push([key, entry])
  }
  return out
}

function stringListOrMapKeys(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string')
  }
  if (isPlainObjectMap(value)) return Object.keys(value)
  return []
}

function serviceVolumeSources(
  service: Record<string, unknown>,
  namedVolumes: ReadonlySet<string>,
): string[] {
  const value = service.volumes
  if (!Array.isArray(value)) return []
  const sources: string[] = []
  for (const entry of value) {
    if (typeof entry === 'string') {
      const source = entry.split(':')[0]
      if (source && namedVolumes.has(source)) sources.push(source)
      continue
    }
    if (
      isPlainObjectMap(entry) &&
      entry.type === 'volume' &&
      typeof entry.source === 'string' &&
      namedVolumes.has(entry.source)
    ) {
      sources.push(entry.source)
    }
  }
  return sources
}

function composePortField(value: unknown): string {
  if (value === undefined || value === null) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number') {
    return String(value)
  }
  return ''
}

function servicePorts(service: Record<string, unknown>): string[] {
  const value = service.ports
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const entry of value) {
    if (typeof entry === 'string') {
      out.push(entry)
    } else if (isPlainObjectMap(entry) && entry.target != null) {
      const target = composePortField(entry.target)
      const published = composePortField(entry.published)
      out.push(
        published.length > 0 ? `${published}:${target}` : target,
      )
    }
  }
  return out
}

function serviceImage(service: Record<string, unknown>): string | undefined {
  const ref = parseComposeImageRef(service.image)
  if (!ref.image) return undefined
  const name = ref.registry ? `${ref.registry}/${ref.image}` : ref.image
  return ref.tag ? `${name}:${ref.tag}` : name
}

/** Longest-path layering by `depends_on` (dependency sits in an earlier row). Cycle-safe. */
function computeServiceRows(
  names: readonly string[],
  dependsOn: ReadonlyMap<string, readonly string[]>,
): Map<string, number> {
  const row = new Map<string, number>()
  const visiting = new Set<string>()

  function resolve(name: string): number {
    const cached = row.get(name)
    if (cached !== undefined) return cached
    if (visiting.has(name)) return 0
    visiting.add(name)
    let max = -1
    for (const dep of dependsOn.get(name) ?? []) {
      max = Math.max(max, resolve(dep))
    }
    visiting.delete(name)
    const value = max + 1
    row.set(name, value)
    return value
  }

  for (const name of names) resolve(name)
  return row
}

function buildDependsOnMap(
  services: readonly [string, Record<string, unknown>][],
  serviceNameSet: ReadonlySet<string>,
): Map<string, string[]> {
  const dependsOnMap = new Map<string, string[]>()
  for (const [name, service] of services) {
    dependsOnMap.set(
      name,
      stringListOrMapKeys(service.depends_on).filter((dep) => serviceNameSet.has(dep)),
    )
  }
  return dependsOnMap
}

function appendMember(
  membersByResource: Map<string, string[]>,
  resource: string,
  serviceName: string,
): void {
  const members = membersByResource.get(resource) ?? []
  members.push(serviceName)
  membersByResource.set(resource, members)
}

type ServiceGraphBuild = {
  nodes: ComposeGraphNode[]
  networkMembers: Map<string, string[]>
  volumeMembers: Map<string, string[]>
}

function collectServiceGraph(
  services: readonly [string, Record<string, unknown>][],
  serviceRows: ReadonlyMap<string, number>,
  namedVolumes: ReadonlySet<string>,
): ServiceGraphBuild {
  const rowColumnCounters = new Map<number, number>()
  const nodes: ComposeGraphNode[] = []
  const networkMembers = new Map<string, string[]>()
  const volumeMembers = new Map<string, string[]>()

  for (const [name, service] of services) {
    const row = serviceRows.get(name) ?? 0
    const column = rowColumnCounters.get(row) ?? 0
    rowColumnCounters.set(row, column + 1)
    const extension = readServiceTurbopanelExtension(service)

    nodes.push({
      id: `service:${name}`,
      kind: 'service',
      name,
      row,
      column,
      image: serviceImage(service),
      serviceKind: extension?.serviceKind ?? 'container',
      ports: servicePorts(service),
    })

    for (const net of stringListOrMapKeys(service.networks)) {
      appendMember(networkMembers, net, name)
    }
    for (const vol of serviceVolumeSources(service, namedVolumes)) {
      appendMember(volumeMembers, vol, name)
    }
  }

  return { nodes, networkMembers, volumeMembers }
}

function dependsOnEdges(dependsOnMap: ReadonlyMap<string, readonly string[]>): ComposeGraphEdge[] {
  const edges: ComposeGraphEdge[] = []
  for (const [name, deps] of dependsOnMap) {
    for (const dep of deps) {
      edges.push({
        id: `dep:${dep}->${name}`,
        kind: 'depends_on',
        from: `service:${dep}`,
        to: `service:${name}`,
      })
    }
  }
  return edges
}

function appendResourceNodes(
  nodes: ComposeGraphNode[],
  edges: ComposeGraphEdge[],
  membersByResource: ReadonlyMap<string, readonly string[]>,
  kind: 'network' | 'volume',
  resourceRow: number,
  startColumn: number,
): number {
  let resourceColumn = startColumn
  const edgeKind: ComposeGraphEdgeKind = kind
  const idPrefix = kind === 'network' ? 'net' : 'vol'
  for (const [name, members] of membersByResource) {
    if (members.length === 0) continue
    const id = `${kind}:${name}`
    nodes.push({ id, kind, name, row: resourceRow, column: resourceColumn })
    resourceColumn += 1
    for (const member of members) {
      edges.push({
        id: `${idPrefix}:${name}->${member}`,
        kind: edgeKind,
        from: `service:${member}`,
        to: id,
      })
    }
  }
  return resourceColumn
}

/**
 * Insert hostname nodes in a new top row (row 0) with an edge into each
 * served service — traffic flows hosting → service. Shifts every existing
 * node down one row; a no-op when no service has a hostname.
 */
function attachHostingNodes(
  nodes: ComposeGraphNode[],
  edges: ComposeGraphEdge[],
  hostnamesByService: Readonly<Record<string, string>>,
): void {
  const served = nodes.filter(
    (node) => node.kind === 'service' && hostnamesByService[node.name],
  )
  if (served.length === 0) return
  for (const node of nodes) node.row += 1
  let column = 0
  for (const service of served) {
    const hostname = hostnamesByService[service.name]
    if (!hostname) continue
    const id = `host:${service.name}`
    nodes.push({ id, kind: 'hosting', name: hostname, row: 0, column })
    column += 1
    edges.push({
      id: `host:${hostname}->${service.name}`,
      kind: 'hosting',
      from: id,
      to: service.id,
    })
  }
}

function graphGridSize(nodes: readonly ComposeGraphNode[]): { columns: number; rows: number } {
  if (nodes.length === 0) return { columns: 0, rows: 0 }
  const rowWidths = new Map<number, number>()
  for (const node of nodes) {
    rowWidths.set(node.row, Math.max(rowWidths.get(node.row) ?? 0, node.column + 1))
  }
  return {
    columns: Math.max(...rowWidths.values()),
    rows: Math.max(...nodes.map((node) => node.row)) + 1,
  }
}

/**
 * Build a service dependency + network/volume membership graph from a
 * Compose document. Services layer top-down by `depends_on`; networks and
 * volumes sit in one shared row beneath every service layer. When no service
 * declares `networks` at all, an implicit `default` network node joins every
 * service — mirroring real Compose behavior (Compose always creates a
 * project-default network when none is declared). Optional {@link ComposeGraphFacts}
 * add live hosting nodes (hostnames) above the service layers.
 */
export function buildComposeGraph(
  document: unknown,
  facts?: ComposeGraphFacts,
): ComposeGraph {
  const normalized = normalizeCompose(document)
  const services = mapEntries(normalized.data.services)
  const namedVolumes = new Set(mapEntries(normalized.data.volumes).map(([name]) => name))
  const serviceNames = services.map(([name]) => name)
  const dependsOnMap = buildDependsOnMap(services, new Set(serviceNames))
  const { nodes, networkMembers, volumeMembers } = collectServiceGraph(
    services,
    computeServiceRows(serviceNames, dependsOnMap),
    namedVolumes,
  )

  // Compose always creates a project-default network joining every service
  // when none is declared explicitly — surface that implicit topology too.
  if (networkMembers.size === 0 && serviceNames.length > 1) {
    networkMembers.set('default', [...serviceNames])
  }

  const resourceRow = nodes.reduce((max, node) => Math.max(max, node.row), -1) + 1
  const edges = dependsOnEdges(dependsOnMap)
  const afterNetworks = appendResourceNodes(
    nodes,
    edges,
    networkMembers,
    'network',
    resourceRow,
    0,
  )
  appendResourceNodes(nodes, edges, volumeMembers, 'volume', resourceRow, afterNetworks)

  if (facts?.hostnamesByService) {
    attachHostingNodes(nodes, edges, facts.hostnamesByService)
  }

  const { columns, rows } = graphGridSize(nodes)
  return { nodes, edges, columns, rows }
}

/**
 * Plain-text adjacency description of a graph (accessibility fallback per
 * ui-ux-pro-max chart guidance — network graphs grade D without one).
 */
export function describeComposeGraph(graph: ComposeGraph): string[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const lines: string[] = []
  for (const node of graph.nodes) {
    if (node.kind !== 'service') continue
    const dependsOn = graph.edges
      .filter((edge) => edge.kind === 'depends_on' && edge.to === node.id)
      .map((edge) => byId.get(edge.from)?.name)
      .filter((name): name is string => Boolean(name))
    const networks = graph.edges
      .filter((edge) => edge.kind === 'network' && edge.from === node.id)
      .map((edge) => byId.get(edge.to)?.name)
      .filter((name): name is string => Boolean(name))
    const volumes = graph.edges
      .filter((edge) => edge.kind === 'volume' && edge.from === node.id)
      .map((edge) => byId.get(edge.to)?.name)
      .filter((name): name is string => Boolean(name))
    const hostnames = graph.edges
      .filter((edge) => edge.kind === 'hosting' && edge.to === node.id)
      .map((edge) => byId.get(edge.from)?.name)
      .filter((name): name is string => Boolean(name))

    const parts = [node.name]
    if (hostnames.length > 0) parts.push(`served at ${hostnames.join(', ')}`)
    if (dependsOn.length > 0) parts.push(`depends on ${dependsOn.join(', ')}`)
    if (networks.length > 0) parts.push(`on network ${networks.join(', ')}`)
    if (volumes.length > 0) parts.push(`mounts volume ${volumes.join(', ')}`)
    lines.push(parts.length > 1 ? `${parts[0]} — ${parts.slice(1).join('; ')}` : parts[0])
  }
  return lines
}
