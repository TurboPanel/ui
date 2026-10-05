/**
 * Layout of the environment map (ia-v4 section 2): domains on the left
 * ("Visitors"), apps in the middle, data on the right, joined by orthogonal
 * lines that only travel through the gutters between the bands.
 *
 * Pure geometry plus plain-words labels. The renderer (web or native) draws
 * the stations at `x, y, w, h`, the segments and the arrowheads; nothing here
 * knows about markup or navigation, so each station carries a `target` the
 * screen turns into a link.
 */

import { changedShorts } from './effective-config'
import { changedSummary } from './change-labels'
import type { RunsAs } from './linux-users'
import { isAppService, isDataStoreContainer, serviceKindLabel } from './service-roles'
import { plural } from './text'
import type { ConfigChangeRow, V4Service } from './types'

export type MapMode = 'env' | 'base' | 'diff'
export type MapColumnKey = 'visitors' | 'apps' | 'data'
export type MapLineKind = 'https' | 'internal' | 'data'

export const MAP = {
  width: 1040,
  top: 32,
  pitch: 72,
  slot: 60,
  x: { visitors: 0, apps: 300, data: 700 },
  w: { visitors: 220, apps: 320, data: 300 },
  h: { domain: 40, app: 60, data: 56 },
  /** Vertical lines run in the gutter after the visitors and the apps bands. */
  gutters: { domain: 236, data: 636 },
  bands: [
    { key: 'visitors', label: 'Visitors', x: 0, w: 260 },
    { key: 'apps', label: 'Apps', x: 260, w: 400 },
    { key: 'data', label: 'Data', x: 660, w: 380 },
  ],
} as const

const LINE_THICKNESS: Readonly<Record<MapLineKind, number>> = {
  https: 3,
  internal: 2,
  data: 3,
}

export type MapStatus = Readonly<{ key: string; label: string }>

export type MapDomain = Readonly<{
  host: string
  /** The certificate word, already worked out by the caller ("Secure"). */
  status: MapStatus
  /** The host this domain forwards to, when it only redirects. */
  redirectTo?: string
  /** The app that answers this domain; without it the first web app is assumed. */
  serviceId?: string
}>

export type MapVolume = Readonly<{
  name: string
  /** "web:/app/cache": the service (name or id) and the path. */
  mount: string
  /** "2.1 GB", or null when the size is not known. */
  size: string | null
  /** When it was last backed up ("Today 04:00"); null = never; undefined = not known. */
  lastBackup: string | null | undefined
}>

/** A line from an app to another service (data link) or to a volume. */
export type MapLink = Readonly<{ from: string; to: string; kind: MapLineKind }>

export type MapInput = Readonly<{
  mode: MapMode
  /** The environment being drawn; null draws the Base alone. */
  envName: string | null
  services: readonly V4Service[]
  domains: readonly MapDomain[]
  volumes: readonly MapVolume[]
  /** Links between services, by service id. */
  links: readonly MapLink[]
  /** What the environment changes compared with the Base (empty for the Base). */
  changes: readonly ConfigChangeRow[]
  /** Who runs the service; `inEnvironment` is false when the Base is drawn. */
  runsAs: (service: V4Service, inEnvironment: boolean) => RunsAs
  status: (service: V4Service) => MapStatus | null
}>

export type MapTarget = Readonly<{
  kind: 'domain' | 'service' | 'data' | 'volume'
  id: string
}>

export type MapNode = Readonly<{
  id: string
  kind: 'domain' | 'app' | 'store' | 'db' | 'volume'
  column: MapColumnKey
  name: string
  sub: string
  /** "as website", "Runs inside its container" or empty. */
  runs: string
  status: MapStatus | null
  /** Blue tags: "Staging change", "Changed: start command", "Removed in Staging". */
  tags: readonly string[]
  changed: boolean
  removed: boolean
  /** "2 jobs" or empty. */
  jobsLabel: string
  /** What the station opens. */
  target: MapTarget
  /** What the station is joined to, in words ("-> postgres"), for the phone form. */
  connections: readonly string[]
  aria: string
  x: number
  y: number
  w: number
  h: number
}>

export type MapSegment = Readonly<{
  orientation: 'h' | 'v'
  kind: MapLineKind
  x: number
  y: number
  w: number
  h: number
}>

export type MapHead = Readonly<{ kind: MapLineKind; x: number; y: number }>

export type MapBand = Readonly<{
  key: MapColumnKey
  label: string
  x: number
  w: number
  note: string
}>

export type MapColumn = Readonly<{
  key: MapColumnKey
  label: string
  emptyText: string
  nodes: readonly MapNode[]
}>

export type MapLayout = Readonly<{
  mode: MapMode
  envName: string
  w: number
  h: number
  bands: readonly MapBand[]
  nodes: readonly MapNode[]
  segments: readonly MapSegment[]
  heads: readonly MapHead[]
  /** The same stations grouped for the vertical (phone) form and mini maps. */
  columns: readonly MapColumn[]
  legend: readonly Readonly<{ kind: MapLineKind; label: string }>[]
  counts: Readonly<{ domains: number; apps: number; data: number }>
  changeCount: number
  aria: string
}>

type DataEntry =
  | Readonly<{ id: string; service: V4Service }>
  | Readonly<{ id: string; volume: MapVolume }>

type DomainEntry = MapDomain & Readonly<{ to: string | null }>

type RowPlan = Readonly<{
  rowOf: ReadonlyMap<string, number>
  appRow: ReadonlyMap<string, number>
  rows: number
}>

// --- rows ----------------------------------------------------------------------

/** Claim the next free row at or below `floor`; returns the new "next free" row. */
function claimRow(
  rowOf: Map<string, number>,
  key: string,
  floor: number,
  next: number,
): number {
  if (rowOf.has(key)) return next
  const row = Math.max(next, floor)
  rowOf.set(key, row)
  return row + 1
}

/**
 * Apps keep their order; each app's domains and data start on the app's row
 * where possible so connected stations line up.
 */
function planRows(
  apps: readonly V4Service[],
  domains: readonly DomainEntry[],
  data: readonly DataEntry[],
  links: readonly MapLink[],
): RowPlan {
  const appRow = new Map(apps.map((app, index) => [app.id, index]))
  const dataIds = new Set(data.map((entry) => entry.id))
  const rowOf = new Map<string, number>()
  let nextDomain = 0
  let nextData = 0
  for (const app of apps) {
    const floor = appRow.get(app.id) ?? 0
    for (const domain of domains.filter((item) => item.to === app.id)) {
      nextDomain = claimRow(rowOf, `d:${domain.host}`, floor, nextDomain)
    }
    for (const link of links.filter((item) => item.from === app.id && dataIds.has(item.to))) {
      nextData = claimRow(rowOf, `s:${link.to}`, floor, nextData)
    }
  }
  for (const domain of domains) nextDomain = claimRow(rowOf, `d:${domain.host}`, 0, nextDomain)
  for (const entry of data) nextData = claimRow(rowOf, `s:${entry.id}`, 0, nextData)
  return { rowOf, appRow, rows: Math.max(apps.length, nextDomain, nextData, 1) }
}

function place(
  column: MapColumnKey,
  row: number,
  height: number,
): Pick<MapNode, 'x' | 'y' | 'w' | 'h'> {
  return {
    x: MAP.x[column],
    y: MAP.top + row * MAP.pitch + (MAP.slot - height) / 2,
    w: MAP.w[column],
    h: height,
  }
}

// --- words ---------------------------------------------------------------------

function entryName(entry: DataEntry): string {
  return 'service' in entry ? entry.service.name : entry.volume.name
}

function backupText(volume: MapVolume): string | null {
  if (volume.lastBackup === undefined) return null
  return volume.lastBackup === null
    ? 'no backups'
    : `backed up ${volume.lastBackup.replace(/^Today/, 'today')}`
}

/** What is known about a volume besides its name; the mount when nothing else is. */
function volumeFacts(volume: MapVolume): string[] {
  const facts = [volume.size, backupText(volume)].filter((fact): fact is string => fact !== null)
  return facts.length > 0 || volume.mount === '' ? facts : [volume.mount]
}

/** Labels of what each station is joined to, keyed by station id. */
function describeConnections(
  apps: readonly V4Service[],
  domains: readonly DomainEntry[],
  data: readonly DataEntry[],
  links: readonly MapLink[],
): Map<string, string[]> {
  const result = new Map<string, string[]>()
  const add = (id: string, label: string) => {
    result.set(id, [...(result.get(id) ?? []), label])
  }
  for (const domain of domains) {
    const app = apps.find((item) => item.id === domain.to)
    if (app === undefined) continue
    add(`d:${domain.host}`, `-> ${app.name}`)
    add(`a:${app.id}`, `<- ${domain.host}`)
  }
  for (const link of links) {
    const from = apps.find((item) => item.id === link.from)
    const target = data.find((entry) => entry.id === link.to)
    add(`a:${link.from}`, `-> ${target === undefined ? link.to : entryName(target)}`)
    add(`s:${link.to}`, `<- ${from?.name ?? link.from}`)
  }
  return result
}

function appTags(
  input: MapInput,
  app: V4Service,
): Readonly<{ tags: string[]; changed: boolean; removed: boolean }> {
  const shorts = changedShorts(input.changes, app.id)
  if (input.envName === null || shorts.length === 0) {
    return { tags: [], changed: false, removed: false }
  }
  if (input.mode !== 'diff') {
    return { tags: [`${input.envName} change`], changed: true, removed: false }
  }
  const removed = input.changes.some(
    (change) => change.key === `svc:${app.id}` && change.removed,
  )
  if (removed) {
    return { tags: [`Removed in ${input.envName}`], changed: false, removed: true }
  }
  const added = input.changes.some((change) => change.key === `svc:${app.id}` && change.added)
  if (added) return { tags: [`Added in ${input.envName}`], changed: true, removed: false }
  return { tags: [changedSummary(shorts)], changed: true, removed: false }
}

/** The app a domain says it belongs to, when that app is drawn. */
function answeringApp(apps: readonly V4Service[], domain: MapDomain): string | undefined {
  return apps.find((app) => app.id === domain.serviceId)?.id
}

/** Spoken description: the parts that exist, separated by commas. */
function joinAria(parts: readonly (string | false | null | undefined)[]): string {
  return parts.filter((part) => typeof part === 'string' && part !== '').join(', ')
}

function appAria(parts: {
  app: V4Service
  status: MapStatus | null
  runs: RunsAs
  shows: readonly string[]
  uses: readonly string[]
  tag: string | undefined
}): string {
  const { app, status, runs, shows, uses, tag } = parts
  const words = [app.name, serviceKindLabel(app.kind)]
  if (status !== null) words.push(status.label.toLowerCase())
  if (runs.runsInContainer) words.push('runs inside its container')
  else if (runs.user !== '') words.push(`runs as ${runs.user}`)
  if (shows.length > 0) words.push(`shows ${shows.join(', ')}`)
  if (uses.length > 0) words.push(`uses ${uses.join(', ')}`)
  if (tag !== undefined) words.push(tag)
  return words.join(', ')
}

// --- stations ------------------------------------------------------------------

type Build = Readonly<{
  input: MapInput
  useEnv: boolean
  apps: readonly V4Service[]
  domains: readonly DomainEntry[]
  data: readonly DataEntry[]
  links: readonly MapLink[]
  plan: RowPlan
  connections: ReadonlyMap<string, readonly string[]>
}>

function baseNode(
  build: Build,
  id: string,
  column: MapColumnKey,
  row: number,
  height: number,
): Pick<MapNode, 'id' | 'column' | 'connections' | 'x' | 'y' | 'w' | 'h'> {
  return {
    id,
    column,
    connections: build.connections.get(id) ?? [],
    ...place(column, row, height),
  }
}

function domainNode(build: Build, domain: DomainEntry): MapNode {
  const id = `d:${domain.host}`
  const app = build.apps.find((item) => item.id === domain.to)
  return {
    ...baseNode(build, id, 'visitors', build.plan.rowOf.get(id) ?? 0, MAP.h.domain),
    kind: 'domain',
    name: domain.host,
    sub: '',
    runs: '',
    status: domain.status,
    tags: [],
    changed: false,
    removed: false,
    jobsLabel: '',
    target: { kind: 'domain', id: domain.host },
    aria: joinAria([
      domain.host,
      'domain',
      domain.status.label.toLowerCase(),
      app && `shows ${app.name}`,
    ]),
  }
}

function appNode(build: Build, app: V4Service): MapNode {
  const { input, useEnv } = build
  const status = useEnv ? input.status(app) : null
  const runs = input.runsAs(app, useEnv)
  const { tags, changed, removed } = appTags(input, app)
  const shows = build.domains
    .filter((domain) => domain.to === app.id && domain.redirectTo === undefined)
    .map((domain) => domain.host)
  const uses = build.links
    .filter((link) => link.from === app.id)
    .map((link) => {
      const target = build.data.find((entry) => entry.id === link.to)
      return target === undefined ? link.to : entryName(target)
    })
  const id = `a:${app.id}`
  const jobs = app.jobCount ?? 0
  return {
    ...baseNode(build, id, 'apps', build.plan.appRow.get(app.id) ?? 0, MAP.h.app),
    kind: 'app',
    name: app.name,
    sub: '',
    runs: runs.runsInContainer ? runs.label : runs.short,
    status,
    tags,
    changed,
    removed,
    jobsLabel: jobs > 0 ? plural(jobs, 'job') : '',
    target: { kind: 'service', id: app.id },
    aria: appAria({ app, status, runs, shows, uses, tag: tags[0] }),
  }
}

function dataServiceWords(service: V4Service, store: boolean): { sub: string; what: string } {
  const engine = service.engine ?? ''
  if (store) {
    const image = service.image ?? engine
    return { sub: image, what: `data container ${image}` }
  }
  return {
    sub: engine === '' ? service.name : `${service.name} · ${engine}`,
    what: engine === '' ? 'database' : `database ${engine}`,
  }
}

function serviceDataNode(build: Build, service: V4Service, row: number): MapNode {
  const store = isDataStoreContainer(service)
  const status = build.useEnv ? build.input.status(service) : null
  const { sub, what } = dataServiceWords(service, store)
  return {
    ...baseNode(build, `s:${service.id}`, 'data', row, MAP.h.data),
    kind: store ? 'store' : 'db',
    name: service.name,
    sub,
    runs: store ? build.input.runsAs(service, build.useEnv).label : '',
    status,
    tags: [],
    changed: false,
    removed: false,
    jobsLabel: '',
    target: { kind: 'data', id: service.id },
    aria: joinAria([service.name, what, status?.label.toLowerCase()]),
  }
}

function volumeNode(build: Build, id: string, volume: MapVolume, row: number): MapNode {
  const facts = volumeFacts(volume)
  return {
    ...baseNode(build, `s:${id}`, 'data', row, MAP.h.data),
    kind: 'volume',
    name: volume.name,
    sub: facts.join(' · '),
    runs: '',
    status: null,
    tags: [],
    changed: false,
    removed: false,
    jobsLabel: '',
    target: { kind: 'volume', id },
    aria: [volume.name, 'storage', ...facts].join(', '),
  }
}

function dataNode(build: Build, entry: DataEntry): MapNode {
  const row = build.plan.rowOf.get(`s:${entry.id}`) ?? 0
  if ('service' in entry) return serviceDataNode(build, entry.service, row)
  return volumeNode(build, entry.id, entry.volume, row)
}

// --- lines ---------------------------------------------------------------------

type Lines = { segments: MapSegment[]; heads: MapHead[] }

/**
 * Right-middle of the source, a vertical in the gutter, then into the left-middle
 * of the target with an arrowhead at the end. Same row: one straight line.
 */
function route(
  lines: Lines,
  from: MapNode,
  to: MapNode,
  kind: MapLineKind,
  gutterX: number,
): void {
  const x1 = from.x + from.w
  const y1 = from.y + from.h / 2
  const x2 = to.x - 8
  const y2 = to.y + to.h / 2
  const t = LINE_THICKNESS[kind]
  const h = (x: number, y: number, w: number): MapSegment => ({
    orientation: 'h',
    kind,
    x,
    y,
    w,
    h: t,
  })
  if (y1 === y2) {
    lines.segments.push(h(x1, y1, x2 - x1))
  } else {
    lines.segments.push(
      h(x1, y1, gutterX - x1 + 1),
      { orientation: 'v', kind, x: gutterX, y: Math.min(y1, y2), w: t, h: Math.abs(y2 - y1) },
      h(gutterX - 1, y2, x2 - gutterX + 1),
    )
  }
  lines.heads.push({ kind, x: x2, y: y2 })
}

function drawLines(build: Build, nodes: ReadonlyMap<string, MapNode>): Lines {
  const lines: Lines = { segments: [], heads: [] }
  for (const domain of build.domains) {
    const from = nodes.get(`d:${domain.host}`)
    const to = domain.to === null ? undefined : nodes.get(`a:${domain.to}`)
    if (from === undefined || to === undefined) continue
    const row = build.plan.appRow.get(domain.to ?? '') ?? 0
    route(lines, from, to, 'https', MAP.gutters.domain + (row % 4) * 10)
  }
  const dataIndex = new Map(build.data.map((entry, index) => [entry.id, index]))
  for (const link of build.links) {
    const from = nodes.get(`a:${link.from}`)
    const to = nodes.get(`s:${link.to}`)
    if (from === undefined || to === undefined) continue
    route(lines, from, to, link.kind, MAP.gutters.data + ((dataIndex.get(link.to) ?? 0) % 4) * 10)
  }
  const round = (n: number) => Math.round(n)
  // Two apps on one data store, or two domains on one app, route to the same
  // arrowhead and the same last stretch; drawn twice they only darken it, and
  // the position-based React keys would repeat. Keep one of each.
  return {
    segments: uniqueBy(
      lines.segments.map((s) => ({
        ...s,
        x: round(s.x),
        y: round(s.y),
        w: round(s.w),
        h: round(s.h),
      })),
      (s) => `${s.orientation}-${s.kind}-${s.x}-${s.y}-${s.w}-${s.h}`,
    ),
    heads: uniqueBy(
      lines.heads.map((s) => ({ ...s, x: round(s.x), y: round(s.y) })),
      (s) => `${s.kind}-${s.x}-${s.y}`,
    ),
  }
}

function uniqueBy<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = keyOf(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// --- assembly ------------------------------------------------------------------

function volumeLinks(
  services: readonly V4Service[],
  volumes: readonly MapVolume[],
): MapLink[] {
  const links: MapLink[] = []
  volumes.forEach((volume, index) => {
    const owner = volume.mount.split(':')[0]
    const service = services.find((item) => item.name === owner || item.id === owner)
    if (service !== undefined) {
      links.push({ from: service.id, to: `vol${index}`, kind: 'data' })
    }
  })
  return links
}

function bandNote(
  key: MapColumnKey,
  useEnv: boolean,
  counts: MapLayout['counts'],
): string {
  if (key === 'visitors') {
    if (!useEnv) return 'Domains are set per environment'
    return counts.domains > 0 ? '' : 'No domains yet'
  }
  return key === 'apps' && counts.apps === 0 ? 'No apps yet' : ''
}

function columnEmptyText(key: MapColumnKey, useEnv: boolean): string {
  if (key === 'visitors') return useEnv ? 'No domains yet' : 'Set per environment'
  return key === 'apps' ? 'No apps yet' : 'None'
}

/**
 * Lay out an environment (`env`), the Base alone (`base`), or an environment
 * against the Base (`diff`). With `base` and an environment, apps that the
 * environment changes still carry its tag ("Compare with").
 */
export function mapLayout(input: MapInput): MapLayout {
  const useEnv = input.envName !== null && input.mode !== 'base'
  const apps = input.services
    .filter(isAppService)
    .sort((a, b) => Number(b.web === true) - Number(a.web === true))
  const volumes = useEnv ? input.volumes : []
  const data: DataEntry[] = [
    ...input.services
      .filter((service) => !isAppService(service))
      .map((service) => ({ id: service.id, service })),
    ...volumes.map((volume, index) => ({ id: `vol${index}`, volume })),
  ]
  const links = [...input.links, ...volumeLinks(input.services, volumes)]
  const web = apps.find((app) => app.web === true) ?? apps[0]
  const domains: DomainEntry[] = useEnv
    ? input.domains.map((domain) => ({ ...domain, to: answeringApp(apps, domain) ?? web?.id ?? null }))
    : []
  const plan = planRows(apps, domains, data, links)
  const build: Build = {
    input,
    useEnv,
    apps,
    domains,
    data,
    links,
    plan,
    connections: describeConnections(apps, domains, data, links),
  }
  const nodes = [
    ...domains.map((domain) => domainNode(build, domain)),
    ...apps.map((app) => appNode(build, app)),
    ...data.map((entry) => dataNode(build, entry)),
  ]
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const { segments, heads } = drawLines(build, byId)
  const counts = { domains: domains.length, apps: apps.length, data: data.length }
  const envName = input.envName ?? 'Base'
  return {
    mode: input.mode,
    envName,
    w: MAP.width,
    h: MAP.top + plan.rows * MAP.pitch + 8,
    bands: MAP.bands.map((band) => ({ ...band, note: bandNote(band.key, useEnv, counts) })),
    nodes,
    segments,
    heads,
    columns: MAP.bands.map((band) => ({
      key: band.key,
      label: band.label,
      emptyText: columnEmptyText(band.key, useEnv),
      nodes: nodes.filter((node) => node.column === band.key),
    })),
    legend: [
      { kind: 'https', label: 'visitors' },
      { kind: 'internal', label: 'inside the project' },
      { kind: 'data', label: 'data' },
    ],
    counts,
    changeCount: input.changes.length,
    aria: `Map of ${useEnv ? envName : 'the Base'}: ${plural(counts.domains, 'domain')}, ${plural(counts.apps, 'app')}, ${plural(counts.data, 'data store')}`,
  }
}
