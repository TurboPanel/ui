/**
 * Pure writers for the Configuration tab: what "this environment only",
 * "Go back to Base" and "Make this the Base" do to the saved compose files.
 *
 * - The environment's own compose holds only its changes (a partial layer; the
 *   control plane checks the merge with the Base, not the layer alone).
 * - **Go back to Base deletes the environment's entry.** It never writes
 *   `!reset`: in a merge `!reset` removes the Base value instead of restoring it.
 * - **Make this the Base** copies the value the environment really runs (read
 *   from the merge, because Compose merges ports, volumes and environment) into
 *   the Base, then deletes the environment's entry.
 * - A change to a Base app that sets only `x-turbopanel` fields restates the
 *   app's `serviceKind` (and its `source.sourceId` / `buildKind`) in the
 *   environment's layer, because those checks run per layer (turbopanel#324,
 *   "Not changed here"; checked against the control plane's validators).
 *   Going back takes those markers away again.
 *
 * Only the `services` block is touched, plus the root `x-turbopanel.principals`
 * map for Linux-user sign-in access. A stand-alone environment keeps its
 * services inside a `!override` tag; the writers edit inside it and re-wrap it.
 *
 * Pure: documents in, documents out. No network, no React.
 */

import type { ComposeDocument } from '@/lib/compose'
import { mergeComposeOverlay, normalizeCompose } from '@/lib/compose'
import {
  composeTagOf,
  isComposeTaggedValue,
  makeComposeTag,
  unwrapComposeTag,
  type ComposeTagName,
} from '@/lib/compose/tags'
import { EXTENSION_KEY, LINUX_USER_PATH, linuxUserAccessPath } from './compose-syntax'

type Mapping = Record<string, unknown>

export type ComposePath = readonly string[]

export type EditResult =
  | Readonly<{ ok: true; document: ComposeDocument }>
  | Readonly<{ ok: false; reason: string }>

/** Where a value lives: one app's block, or the root of the document. */
export type EditScopeTarget = Readonly<{ serviceName: string | null }>

const EXTENSION = EXTENSION_KEY

function isMapping(value: unknown): value is Mapping {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The compose path a config-view `field` writes to, or `null` when it has no single path. */
export function composePathFor(field: string | null): ComposePath | null {
  if (field === null || field === 'kind' || field.startsWith('domain:')) return null
  if (field === 'linuxUser') return LINUX_USER_PATH
  if (field.startsWith('panel.')) return [EXTENSION, ...field.slice('panel.'.length).split('.')]
  if (field.startsWith('environment.')) return ['environment', field.slice('environment.'.length)]
  return field.split('.')
}

/** The root path of a Linux user's sign-in access (`user:name` changes). */
export function principalAccessPath(name: string): ComposePath {
  return linuxUserAccessPath(name)
}

// --- reading ---------------------------------------------------------------

type ServicesBlock = Readonly<{ services: Mapping; tag: ComposeTagName | null }>

function readServices(document: Pick<ComposeDocument, 'data'>): ServicesBlock {
  const raw = document.data.services
  const tag = composeTagOf(raw)
  const inner = unwrapComposeTag(raw)
  return { services: isMapping(inner) ? inner : {}, tag }
}

function writeServices(document: ComposeDocument, block: ServicesBlock): ComposeDocument {
  const data: Mapping = { ...document.data }
  if (block.tag !== null) data.services = makeComposeTag(block.tag, block.services)
  else if (Object.keys(block.services).length > 0) data.services = block.services
  else delete data.services
  const keyOrder = document.presentation.keyOrder.filter((key) => key in data)
  if ('services' in data && !keyOrder.includes('services')) keyOrder.push('services')
  return { ...document, data, presentation: { ...document.presentation, keyOrder } }
}

function withRoot(document: ComposeDocument, data: Mapping): ComposeDocument {
  const keyOrder = document.presentation.keyOrder.filter((key) => key in data)
  for (const key of Object.keys(data)) if (!keyOrder.includes(key)) keyOrder.push(key)
  return { ...document, data, presentation: { ...document.presentation, keyOrder } }
}

function containerOf(
  data: Mapping,
  target: EditScopeTarget
): Mapping | 'tagged' | undefined {
  if (target.serviceName === null) return data
  const { services } = readServices({ data })
  const body = services[target.serviceName]
  if (body === undefined) return undefined
  if (isComposeTaggedValue(body) || !isMapping(body)) return 'tagged'
  return body
}

function getAt(root: unknown, path: ComposePath): unknown {
  let current: unknown = root
  for (const key of path) {
    if (!isMapping(current)) return undefined
    current = current[key]
  }
  return current
}

/** `environment: ["A=1", "B"]` is the list form of `environment: { A: "1", B: null }`. */
function envListEntry(list: readonly unknown[], name: string): number {
  return list.findIndex(
    (item) => typeof item === 'string' && (item === name || item.startsWith(`${name}=`))
  )
}

function readEnvironmentEntry(container: Mapping, name: string): unknown {
  const raw = container.environment
  if (!Array.isArray(raw)) return isMapping(raw) ? raw[name] : undefined
  const at = envListEntry(raw, name)
  if (at < 0) return undefined
  const item = raw[at] as string
  const eq = item.indexOf('=')
  return eq < 0 ? null : item.slice(eq + 1)
}

/** The value an environment really runs, read from the merge of the Base and its changes. */
export function readMergedValue(
  projectCompose: unknown,
  environmentCompose: unknown,
  target: EditScopeTarget,
  path: ComposePath
): unknown {
  const merged = mergeComposeOverlay(projectCompose, environmentCompose)
  const container = containerOf(merged.data, target)
  if (container === undefined || container === 'tagged') return undefined
  if (path[0] === 'environment' && path.length === 2) return readEnvironmentEntry(container, path[1])
  return getAt(container, path)
}

// --- low-level set / delete ------------------------------------------------

function cloneMapping(value: unknown): Mapping {
  return isMapping(value) ? { ...value } : {}
}

function setAt(container: Mapping, path: ComposePath, value: unknown): Mapping {
  const [head, ...rest] = path
  if (rest.length === 0) return { ...container, [head]: value }
  return { ...container, [head]: setAt(cloneMapping(container[head]), rest, value) }
}

function setEnvironmentEntry(container: Mapping, name: string, value: unknown): Mapping {
  const raw = container.environment
  if (!Array.isArray(raw)) {
    return { ...container, environment: { ...cloneMapping(raw), [name]: value } }
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  const item = value === null || value === undefined ? name : `${name}=${text}`
  const at = envListEntry(raw, name)
  const list = [...raw]
  if (at < 0) list.push(item)
  else list[at] = item
  return { ...container, environment: list }
}

function deleteEnvironmentEntry(container: Mapping, name: string): Mapping {
  const raw = container.environment
  const next = { ...container }
  if (Array.isArray(raw)) {
    const at = envListEntry(raw, name)
    const list = raw.filter((_, index) => index !== at)
    if (list.length > 0) next.environment = list
    else delete next.environment
    return next
  }
  const entries = { ...cloneMapping(raw) }
  delete entries[name]
  if (Object.keys(entries).length > 0) next.environment = entries
  else delete next.environment
  return next
}

/** Delete a path and every parent mapping the deletion leaves empty. */
function deleteAt(container: Mapping, path: ComposePath): Mapping {
  const [head, ...rest] = path
  if (!(head in container)) return container
  const next = { ...container }
  if (rest.length === 0) {
    delete next[head]
    return next
  }
  const child = container[head]
  if (!isMapping(child) || isComposeTaggedValue(child)) return container
  const pruned = deleteAt(child, rest)
  if (Object.keys(pruned).length > 0) next[head] = pruned
  else delete next[head]
  return next
}

// --- markers ---------------------------------------------------------------

type Markers = Readonly<{ serviceKind?: unknown; sourceId?: unknown; buildKind?: unknown }>

function markersOf(service: unknown): Markers {
  if (!isMapping(service) || !isMapping(service[EXTENSION])) return {}
  const ext = service[EXTENSION]
  const source = isMapping(ext.source) ? ext.source : {}
  return { serviceKind: ext.serviceKind, sourceId: source.sourceId, buildKind: source.buildKind }
}

/**
 * What an environment's layer must restate so a change to `x-turbopanel` still
 * saves: the app's kind (`principal` is only valid on a site or Node.js app) and
 * its repository (a Node.js app "requires source"). These checks run on the
 * layer alone, before it is merged with the Base.
 */
function addMarkers(body: Mapping, path: ComposePath, merged: Markers): Mapping {
  if (path[0] !== EXTENSION) return body
  let next = body
  if (merged.serviceKind !== undefined) {
    next = setAt(next, [EXTENSION, 'serviceKind'], merged.serviceKind)
  }
  if (merged.sourceId !== undefined) {
    next = setAt(next, [EXTENSION, 'source', 'sourceId'], merged.sourceId)
    if (merged.buildKind === 'railpack') {
      next = setAt(next, [EXTENSION, 'source', 'buildKind'], 'railpack')
    }
  }
  return next
}

const SOURCE_MARKER_KEYS = new Set(['sourceId', 'buildKind'])

/** Take back markers that only restate what the Base says, and an app left with nothing else. */
function stripMarkers(body: Mapping, project: Markers): Mapping {
  const ext = body[EXTENSION]
  if (!isMapping(ext)) return body
  let next = cloneMapping(ext)
  if (isMapping(next.source)) {
    const source = next.source
    const onlyMarkers = Object.keys(source).every((key) => SOURCE_MARKER_KEYS.has(key))
    const same =
      source.sourceId === project.sourceId &&
      (source.buildKind === undefined || source.buildKind === project.buildKind)
    if (onlyMarkers && same) delete next.source
  }
  const kindOnly = Object.keys(next).length === 1 && 'serviceKind' in next
  if (kindOnly && next.serviceKind === project.serviceKind) next = {}
  const out = { ...body }
  if (Object.keys(next).length > 0) out[EXTENSION] = next
  else delete out[EXTENSION]
  return out
}

// --- document edits --------------------------------------------------------

function documentOf(value: unknown): ComposeDocument {
  return normalizeCompose(value)
}

function mapService(
  document: ComposeDocument,
  name: string,
  change: (body: Mapping | undefined) => Mapping | null
): EditResult {
  const block = readServices(document)
  const current = block.services[name]
  if (current !== undefined && (isComposeTaggedValue(current) || !isMapping(current))) {
    return { ok: false, reason: `${name} is replaced as a whole here, so one setting cannot be changed on its own.` }
  }
  const next = change(current as Mapping | undefined)
  const services = { ...block.services }
  if (next === null || Object.keys(next).length === 0) delete services[name]
  else services[name] = next
  return { ok: true, document: writeServices(document, { ...block, services }) }
}

function applySet(container: Mapping, path: ComposePath, value: unknown): Mapping {
  if (path[0] === 'environment' && path.length === 2) {
    return setEnvironmentEntry(container, path[1], value)
  }
  return setAt(container, path, value)
}

function applyDelete(container: Mapping, path: ComposePath): Mapping {
  if (path[0] === 'environment' && path.length === 2) return deleteEnvironmentEntry(container, path[1])
  return deleteAt(container, path)
}

function setInDocument(
  document: ComposeDocument,
  target: EditScopeTarget,
  path: ComposePath,
  value: unknown,
  merged: Markers | null
): EditResult {
  if (target.serviceName === null) {
    return { ok: true, document: withRoot(document, applySet({ ...document.data }, path, value)) }
  }
  return mapService(document, target.serviceName, (body) => {
    const base = addMarkers(cloneMapping(body), path, merged ?? {})
    return applySet(base, path, value)
  })
}

function deleteInDocument(
  document: ComposeDocument,
  target: EditScopeTarget,
  path: ComposePath,
  project: Markers
): EditResult {
  if (target.serviceName === null) {
    return { ok: true, document: withRoot(document, applyDelete({ ...document.data }, path)) }
  }
  const { serviceName } = target
  const block = readServices(document)
  if (!(serviceName in block.services)) return { ok: true, document }
  // A stand-alone environment owns its apps whole: its markers are not restatements.
  const keepMarkers = block.tag !== null
  return mapService(document, serviceName, (body) => {
    const pruned = applyDelete(cloneMapping(body), path)
    return keepMarkers ? pruned : stripMarkers(pruned, project)
  })
}

function serviceMarkers(compose: ComposeDocument, name: string | null): Markers {
  if (name === null) return {}
  return markersOf(readServices(compose).services[name])
}

/** Save a value as a change in this environment only. */
export function setEnvironmentValue(params: Readonly<{
  projectCompose: unknown
  environmentCompose: unknown
  target: EditScopeTarget
  path: ComposePath
  value: unknown
}>): EditResult {
  const merged = mergeComposeOverlay(params.projectCompose, params.environmentCompose)
  return setInDocument(
    documentOf(params.environmentCompose),
    params.target,
    params.path,
    params.value,
    serviceMarkers(merged, params.target.serviceName)
  )
}

/** Save a value in the Base. The Base has to have the app already. */
export function setBaseValue(params: Readonly<{
  projectCompose: unknown
  target: EditScopeTarget
  path: ComposePath
  value: unknown
}>): EditResult {
  const project = documentOf(params.projectCompose)
  const { serviceName } = params.target
  if (serviceName !== null && !(serviceName in readServices(project).services)) {
    return { ok: false, reason: `The Base has no app named ${serviceName}.` }
  }
  return setInDocument(project, params.target, params.path, params.value, null)
}

/** Go back to Base: delete this environment's entry (never `!reset`). */
export function removeEnvironmentValue(params: Readonly<{
  projectCompose: unknown
  environmentCompose: unknown
  target: EditScopeTarget
  path: ComposePath
}>): EditResult {
  const project = documentOf(params.projectCompose)
  return deleteInDocument(
    documentOf(params.environmentCompose),
    params.target,
    params.path,
    serviceMarkers(project, params.target.serviceName)
  )
}

/** Go back to Base for an app the environment removed (`services.name: !reset`). */
export function restoreEnvironmentService(
  environmentCompose: unknown,
  serviceName: string
): EditResult {
  const document = documentOf(environmentCompose)
  const block = readServices(document)
  if (composeTagOf(block.services[serviceName]) !== 'reset') {
    return { ok: false, reason: `${serviceName} is not removed in this environment.` }
  }
  const services = { ...block.services }
  delete services[serviceName]
  return { ok: true, document: writeServices(document, { ...block, services }) }
}

export type MakeBaseResult =
  | Readonly<{ ok: true; projectCompose: ComposeDocument; environmentCompose: ComposeDocument }>
  | Readonly<{ ok: false; reason: string }>

/**
 * Make this the Base: copy what the environment runs into the Base, then drop
 * the environment's own entry so both say the same.
 */
export function makeValueTheBase(params: Readonly<{
  projectCompose: unknown
  environmentCompose: unknown
  target: EditScopeTarget
  path: ComposePath
}>): MakeBaseResult {
  const value = readMergedValue(
    params.projectCompose,
    params.environmentCompose,
    params.target,
    params.path
  )
  if (value === undefined) return { ok: false, reason: 'This environment has no value to move.' }
  const base = setBaseValue({ ...params, value })
  if (!base.ok) return base
  const env = removeEnvironmentValue({ ...params, projectCompose: base.document })
  if (!env.ok) return env
  return { ok: true, projectCompose: base.document, environmentCompose: env.document }
}

/**
 * Save in the Base for a value this environment shows: set it in the Base and
 * drop this environment's own change, so the environment follows the Base.
 */
export function setValueInBase(params: Readonly<{
  projectCompose: unknown
  environmentCompose: unknown
  target: EditScopeTarget
  path: ComposePath
  value: unknown
}>): MakeBaseResult {
  const base = setBaseValue(params)
  if (!base.ok) return base
  const env = removeEnvironmentValue({ ...params, projectCompose: base.document })
  if (!env.ok) return env
  return { ok: true, projectCompose: base.document, environmentCompose: env.document }
}
