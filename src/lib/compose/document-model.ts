/**
 * Renderable model of a Compose document — the shape the project editor's
 * Services lens draws.
 *
 * The editor's home surface *is* the compose file: each service is a block of
 * YAML-shaped lines with the live facts (hostname, ports, storage, placement)
 * hanging off it. This module is the pure half — parse the document into
 * blocks and lines. No live data, no layout; the renderer joins those on.
 *
 * Only the keys an operator scans for get their own lines. Everything else is
 * counted into a single trailing line, because the full text is one lens away
 * (Code) and a document that repeats the file verbatim is just a worse editor.
 */
import { parseComposeBuild } from './build-ref'
import { SPANNING_NETWORK_DRIVER } from './field-policy'
import { formatComposeImageRef, parseComposeImageRef } from './image-ref'
import { readServiceSourceExtension } from './service-kind'
import { normalizeCompose } from './types'

/** Keys promoted to their own lines, in the order they render. */
const PROMOTED_SERVICE_KEYS = [
  'image',
  'build',
  'ports',
  'volumes',
  'depends_on',
] as const

export type ComposeDocLine = Readonly<{
  /** `image`, or the item text for a list entry. */
  text: string
  /** Scalar rendered after `text: `. Absent for list items and parent keys. */
  value?: string
  /** Indent level; 0 is the service/resource name itself. */
  depth: number
  /** Rendered with a leading `-`. */
  listItem?: boolean
}>

export type ComposeDocMount = Readonly<{
  /** Named volume, or a host path for bind mounts. */
  source: string
  /** Container path, when the entry declares one. */
  target: string | null
  /** True when `source` matches a top-level `volumes:` entry. */
  named: boolean
}>

export type ComposeDocServiceBlock = Readonly<{
  name: string
  /** `nginx:1.27`, `build: ./api`, or null when neither is declared. */
  source: string | null
  ports: readonly string[]
  mounts: readonly ComposeDocMount[]
  dependsOn: readonly string[]
  lines: readonly ComposeDocLine[]
  /** Keys not promoted to lines (`environment`, `labels`, …). */
  otherKeyCount: number
  /**
   * Whether this service declares `x-turbopanel.source`, i.e. deploys from a
   * Git repository. Read here rather than from the live service rows because
   * it is a property of the *document* — the gutter can offer the releases
   * facet for a binding the operator just added and has not saved yet.
   */
  sourceBound: boolean
}>

export type ComposeDocResourceBlock = Readonly<{
  name: string
  /** Compose service names mounting this volume / joining this network. */
  usedBy: readonly string[]
  /**
   * `external: true`, driver, … — null when the entry is empty (`{}`).
   *
   * A network declared `driver: overlay` reads as
   * {@link SPANNING_NETWORK_DETAIL} rather than as the bare driver string: that
   * value is the authored signal that TurboFabric may span the network across
   * hosts, and "overlay" alone would suggest a Docker overlay driver this
   * platform does not run.
   */
  detail: string | null
}>

/** How a `driver: overlay` network is labelled, rather than as a bare driver. */
export const SPANNING_NETWORK_DETAIL = 'overlay (TurboFabric)'

export type ComposeDocModel = Readonly<{
  services: readonly ComposeDocServiceBlock[]
  volumes: readonly ComposeDocResourceBlock[]
  networks: readonly ComposeDocResourceBlock[]
  isEmpty: boolean
}>

function isMap(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mapEntries(value: unknown): [string, Record<string, unknown>][] {
  if (!isMap(value)) return []
  return Object.entries(value).map(([key, entry]) => [
    key,
    isMap(entry) ? entry : {},
  ])
}

/** Compose scalars arrive as strings or numbers; anything else is not a value. */
function scalarText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}

/** `depends_on` is a list or a condition map; both mean "these services". */
function dependsOnNames(value: unknown): string[] {
  if (Array.isArray(value)) return stringList(value)
  if (isMap(value)) return Object.keys(value)
  return []
}

function portStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const entry of value) {
    if (typeof entry === 'string') {
      out.push(entry)
      continue
    }
    if (typeof entry === 'number') {
      out.push(String(entry))
      continue
    }
    if (isMap(entry)) {
      const published = scalarText(entry.published)
      const target = scalarText(entry.target)
      const text = published ? `${published}:${target}` : target
      if (text.length > 0 && text !== ':') out.push(text)
    }
  }
  return out
}

function parseMount(
  entry: unknown,
  namedVolumes: ReadonlySet<string>,
): ComposeDocMount | null {
  if (typeof entry === 'string') {
    // `source:target[:mode]` — a bare `target` is an anonymous volume.
    const parts = entry.split(':')
    if (parts.length === 1) {
      const only = parts[0] ?? ''
      return only ? { source: only, target: null, named: false } : null
    }
    const source = parts[0] ?? ''
    const target = parts[1] ?? ''
    if (!source) return null
    return { source, target: target || null, named: namedVolumes.has(source) }
  }
  if (isMap(entry)) {
    const source = typeof entry.source === 'string' ? entry.source : ''
    const target = typeof entry.target === 'string' ? entry.target : ''
    if (!source) return null
    return { source, target: target || null, named: namedVolumes.has(source) }
  }
  return null
}

function serviceMounts(
  service: Record<string, unknown>,
  namedVolumes: ReadonlySet<string>,
): ComposeDocMount[] {
  if (!Array.isArray(service.volumes)) return []
  const out: ComposeDocMount[] = []
  for (const entry of service.volumes) {
    const mount = parseMount(entry, namedVolumes)
    if (mount) out.push(mount)
  }
  return out
}

/** `nginx:1.27`, `build ./api`, `build (inline Dockerfile)`, or null. */
function serviceSource(service: Record<string, unknown>): string | null {
  const image = formatComposeImageRef(parseComposeImageRef(service.image))
  if (image) return image
  const build = parseComposeBuild(service.build)
  if (build.kind === 'inline') return 'inline Dockerfile'
  if (build.kind === 'external') {
    return build.dockerfilePath || build.context || 'build'
  }
  return null
}

function mountLineText(mount: ComposeDocMount): string {
  return mount.target ? `${mount.source}:${mount.target}` : mount.source
}

function buildServiceLines(
  service: Record<string, unknown>,
  block: Omit<ComposeDocServiceBlock, 'lines'>,
): ComposeDocLine[] {
  const lines: ComposeDocLine[] = []

  const image = formatComposeImageRef(parseComposeImageRef(service.image))
  if (image) {
    lines.push({ text: 'image', value: image, depth: 1 })
  } else if (block.source) {
    lines.push({ text: 'build', value: block.source, depth: 1 })
  }

  if (block.ports.length > 0) {
    lines.push({ text: 'ports', depth: 1 })
    for (const port of block.ports) {
      lines.push({ text: port, depth: 2, listItem: true })
    }
  }

  if (block.mounts.length > 0) {
    lines.push({ text: 'volumes', depth: 1 })
    for (const mount of block.mounts) {
      lines.push({ text: mountLineText(mount), depth: 2, listItem: true })
    }
  }

  if (block.dependsOn.length > 0) {
    lines.push({ text: 'depends_on', depth: 1 })
    for (const name of block.dependsOn) {
      lines.push({ text: name, depth: 2, listItem: true })
    }
  }

  return lines
}

function countOtherKeys(service: Record<string, unknown>): number {
  const promoted = new Set<string>(PROMOTED_SERVICE_KEYS)
  return Object.keys(service).filter(
    // `x-turbopanel` is our own bookkeeping, never the operator's compose.
    (key) => !promoted.has(key) && !key.startsWith('x-'),
  ).length
}

function resourceDetail(
  entry: Record<string, unknown>,
  kind: 'network' | 'volume',
): string | null {
  if (entry.external === true) return 'external'
  if (typeof entry.name === 'string' && entry.name) return entry.name
  if (typeof entry.driver !== 'string' || !entry.driver) return null
  // Networks only: `overlay` on a volume is just a volume driver name.
  return kind === 'network' && entry.driver.trim() === SPANNING_NETWORK_DRIVER
    ? SPANNING_NETWORK_DETAIL
    : entry.driver
}

/**
 * Parse a Compose document into the blocks the Services lens renders.
 * Definition order is preserved — the file's order is the operator's order.
 */
export function buildComposeDocModel(document: unknown): ComposeDocModel {
  const data = normalizeCompose(document).data
  const volumeEntries = mapEntries(data.volumes)
  const networkEntries = mapEntries(data.networks)
  const namedVolumes = new Set(volumeEntries.map(([name]) => name))

  const volumeUsers = new Map<string, string[]>()
  const networkUsers = new Map<string, string[]>()

  const services = mapEntries(data.services).map(([name, service]) => {
    const ports = portStrings(service.ports)
    const mounts = serviceMounts(service, namedVolumes)
    const dependsOn = dependsOnNames(service.depends_on)

    for (const mount of mounts) {
      if (!mount.named) continue
      volumeUsers.set(mount.source, [
        ...(volumeUsers.get(mount.source) ?? []),
        name,
      ])
    }
    for (const network of stringList(service.networks).concat(
      isMap(service.networks) ? Object.keys(service.networks) : [],
    )) {
      networkUsers.set(network, [...(networkUsers.get(network) ?? []), name])
    }

    const partial = {
      name,
      source: serviceSource(service),
      ports,
      mounts,
      dependsOn,
      otherKeyCount: countOtherKeys(service),
      sourceBound: readServiceSourceExtension(service) !== undefined,
    }
    return { ...partial, lines: buildServiceLines(service, partial) }
  })

  const toResource = (
    [name, entry]: [string, Record<string, unknown>],
    users: Map<string, string[]>,
    kind: 'network' | 'volume',
  ): ComposeDocResourceBlock => ({
    name,
    usedBy: users.get(name) ?? [],
    detail: resourceDetail(entry, kind),
  })

  const volumes = volumeEntries.map((entry) =>
    toResource(entry, volumeUsers, 'volume'),
  )
  const networks = networkEntries.map((entry) =>
    toResource(entry, networkUsers, 'network'),
  )

  return {
    services,
    volumes,
    networks,
    isEmpty:
      services.length === 0 && volumes.length === 0 && networks.length === 0,
  }
}
