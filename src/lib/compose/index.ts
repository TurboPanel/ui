/**
 * Compose helpers for the product console.
 *
 * Merge semantics below MUST stay in parity with
 * `turbopanel/src/lib/compose/merge.ts` (Compose Spec append / dedup / `!reset`
 * / `!override`). That file is the source of truth for what Docker Compose
 * does when multiple `-f` files are merged — never reintroduce naive
 * deep-merge here.
 */

import { hideComposeTurbopanelExtensions as hideTurboExtensions } from './hidden-extension'
import {
  composeTagOf,
  isComposeTaggedValue,
  resolveComposeTags,
} from './tags'
import {
  isBlankComposeData,
  isComposeEditorView,
  normalizeCompose,
  type ComposeComment,
  type ComposeDocument,
  type ComposeEditorView,
  type ComposePresentation,
} from './types'

export type {
  ComposeComment,
  ComposeDocument,
  ComposePresentation,
} from './types'
export {
  emptyComposeDocument,
  isBlankComposeData,
  isComposeDocument,
  isComposeEditorView,
  normalizeCompose,
  pruneBlankComposeData,
  type ComposeEditorView,
} from './types'
export {
  COMPOSE_TAG_KEY,
  composeTagOf,
  isComposeTaggedValue,
  makeComposeTag,
  resolveComposeTags,
  unwrapComposeTag,
  type ComposeTagName,
  type ComposeTaggedValue,
} from './tags'
export {
  ComposeParseError,
  composeDocumentToRuntimeYaml,
  composeDocumentToYaml,
  yamlToComposeDocument,
} from './convert'
export type {
  ComposeLintIssue,
  ComposeLintLevel,
  ComposeLintOptions,
} from './lint'
export {
  blockingComposeLintIssues,
  isComposeServicePropertyKey,
  isComposeTopLevelKey,
  lintComposeYaml,
} from './lint'
export type { ComposeHiddenExtensions } from './hidden-extension'
export {
  hideComposeTurbopanelExtensions,
  hiddenTraditionalWebServiceNames,
  restoreComposeTurbopanelExtensions,
} from './hidden-extension'
export type {
  ComposeServiceKind,
  ComposeServiceTurbopanelExtension,
  TraditionalWebEngine,
} from './service-kind'
export {
  isTraditionalWebComposeService,
  parseServiceTurbopanelExtension,
  readServiceTurbopanelExtension,
  TURBOPANEL_SERVICE_EXTENSION_KEY,
} from './service-kind'
export type {
  HostingPhpApplicability,
  HostingServiceContext,
  HostingWebEnvMode,
} from './hosting-service-context'
export {
  hostingDockerBridgeHint,
  hostingPathPrefixHint,
  hostingPhpSectionCopy,
  hostingServiceKindLabel,
  hostingWebEnvSectionCopy,
  resolveHostingServiceContext,
  shouldRevealOptionalHostingFields,
  traditionalWebEnvKeyForService,
} from './hosting-service-context'
export type { ComposeImageRef } from './image-ref'
export {
  emptyComposeImageRef,
  formatComposeImageRef,
  looksLikeRegistryHost,
  parseComposeImageRef,
  patchComposeImageRef,
} from './image-ref'
export type { ComposeBuildRef } from './build-ref'
export {
  DEFAULT_INLINE_DOCKERFILE,
  clearComposeBuildInline,
  dockerfileHasFromInstruction,
  emptyComposeBuildRef,
  parseComposeBuild,
  setComposeBuildInline,
} from './build-ref'
export type { ComposeOverlayState } from './overlay-state'
export { resolveComposeOverlayState } from './overlay-state'
export type {
  ComposeDocumentSummary,
  ComposeSummaryChip,
} from './summary'
export {
  formatComposeSummaryChips,
  summarizeComposeDocument,
} from './summary'
export type {
  ComposeGraph,
  ComposeGraphEdge,
  ComposeGraphEdgeKind,
  ComposeGraphNode,
  ComposeGraphNodeKind,
} from './graph'
export { buildComposeGraph, describeComposeGraph } from './graph'
export type {
  ComposeRestartPolicy,
  ParsedComposeRestart,
  VisualFieldDef,
  VisualFieldId,
} from './visual-fields'
export {
  COMPOSE_RESTART_POLICIES,
  VISUAL_SERVICE_FIELDS,
  addableVisualFields,
  formatComposeRestart,
  isComposeRestartPolicy,
  parseComposeRestart,
  serviceHasVisualField,
  visualFieldById,
} from './visual-fields'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Preserve editor-only presentation metadata when rebuilding key order / comments. */
function clonePresentationMetadata(
  source: ComposePresentation,
): Pick<ComposePresentation, 'blankLines' | 'documentCommentBefore' | 'documentComment' | 'editorView'> {
  return {
    ...(source.blankLines ? { blankLines: { ...source.blankLines } } : {}),
    ...(typeof source.documentCommentBefore === 'string' &&
        source.documentCommentBefore.length > 0
      ? { documentCommentBefore: source.documentCommentBefore }
      : {}),
    ...(typeof source.documentComment === 'string' && source.documentComment.length > 0
      ? { documentComment: source.documentComment }
      : {}),
    ...(source.editorView ? { editorView: source.editorView } : {}),
  }
}

function buildPresentation(
  source: ComposePresentation,
  patch: {
    keyOrder: string[]
    comments: Record<string, ComposeComment>
  },
  editorView?: ComposeEditorView,
): ComposePresentation {
  const nextEditorView = editorView ?? source.editorView
  return {
    keyOrder: patch.keyOrder,
    comments: patch.comments,
    ...clonePresentationMetadata(source),
    ...(nextEditorView ? { editorView: nextEditorView } : {}),
  }
}

// --- Compose Spec merge (parity with instance/src/lib/compose/merge.ts) ---

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Raw YAML key segments from the document root (not dot-joined). */
type MergePath = readonly string[]

type SequenceStrategy =
  | 'replace'
  | 'ports'
  | 'volumes'
  | 'secrets_configs'
  | 'scalar_dedup'
  | 'keyed_list'
  | 'plain_append'

/**
 * Sequence attributes Compose Spec unique-keys / scalar-dedups.
 * `dns`, `dns_search`, `tmpfs`, and `env_file` intentionally stay plain-append
 * (Docker Compose preserves duplicate entries for those lists).
 */
const SCALAR_DEDUP_ATTRS = new Set([
  'expose',
  'extra_hosts',
])

const KEYED_LIST_ATTRS = new Set(['labels', 'environment', 'depends_on'])

const MAP_LIST_DUALITY_ATTRS = new Set([
  'labels',
  'environment',
  'depends_on',
  'extra_hosts',
])

function leafAttribute(path: MergePath): string {
  return path.at(-1) ?? ''
}

/**
 * True for `services.<name>.healthcheck.test` (replace; never append).
 * Service name may contain dots — match by segment structure.
 */
function isHealthcheckTestPath(path: MergePath): boolean {
  return (
    path.length === 4 &&
    path[0] === 'services' &&
    path[2] === 'healthcheck' &&
    path[3] === 'test'
  )
}

function isServiceAttrPath(path: MergePath, attr: string): boolean {
  return path.length === 3 && path[0] === 'services' && path[2] === attr
}

function isRootAttrPath(path: MergePath, attr: string): boolean {
  return path.length === 1 && path[0] === attr
}

function resolveSequenceStrategy(path: MergePath): SequenceStrategy {
  if (isHealthcheckTestPath(path)) return 'replace'
  if (isServiceAttrPath(path, 'command') || isRootAttrPath(path, 'command')) {
    return 'replace'
  }
  if (
    isServiceAttrPath(path, 'entrypoint') ||
    isRootAttrPath(path, 'entrypoint')
  ) {
    return 'replace'
  }
  if (isServiceAttrPath(path, 'ports') || isRootAttrPath(path, 'ports')) {
    return 'ports'
  }
  if (isServiceAttrPath(path, 'volumes')) return 'volumes'
  if (isServiceAttrPath(path, 'secrets') || isServiceAttrPath(path, 'configs')) {
    return 'secrets_configs'
  }
  const attr = leafAttribute(path)
  if (SCALAR_DEDUP_ATTRS.has(attr)) return 'scalar_dedup'
  if (KEYED_LIST_ATTRS.has(attr)) return 'keyed_list'
  return 'plain_append'
}

/** Presentation boundary: join segments for comment / blank-line keys. */
function presentationPath(path: MergePath): string {
  return path.join('.')
}

type PortKey = {
  hostIp: string
  target: string
  published: string
  protocol: string
}

function portKeyString(key: PortKey): string {
  return `${key.hostIp}|${key.target}|${key.published}|${key.protocol}`
}

function portFieldString(value: unknown): string {
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

/**
 * Parse short `[host_ip:][published:]target[/protocol]` or long-syntax mapping.
 */
function portUniqueKey(entry: unknown): string | null {
  if (typeof entry === 'string' || typeof entry === 'number') {
    return portKeyString(parseShortPort(String(entry)))
  }
  if (!isPlainObject(entry)) return null
  const protocol =
    typeof entry.protocol === 'string' ? entry.protocol.toLowerCase() : 'tcp'
  const hostIp = typeof entry.host_ip === 'string' ? entry.host_ip : ''
  const target = portFieldString(entry.target)
  const published = portFieldString(entry.published)
  return portKeyString({ hostIp, target, published, protocol })
}

function parseShortPort(raw: string): PortKey {
  const trimmed = raw.trim()
  let protocol = 'tcp'
  let body = trimmed
  const slash = trimmed.lastIndexOf('/')
  if (slash > 0 && !trimmed.includes('[')) {
    const maybeProto = trimmed.slice(slash + 1)
    if (/^[A-Za-z0-9]+$/.test(maybeProto)) {
      protocol = maybeProto.toLowerCase()
      body = trimmed.slice(0, slash)
    }
  }

  const parts = splitPortColons(body)
  if (parts.length === 1) {
    return { hostIp: '', target: parts[0] ?? '', published: '', protocol }
  }
  if (parts.length === 2) {
    return {
      hostIp: '',
      published: parts[0] ?? '',
      target: parts[1] ?? '',
      protocol,
    }
  }
  const target = parts.at(-1) ?? ''
  const published = parts.at(-2) ?? ''
  const hostIp = parts.slice(0, -2).join(':')
  return { hostIp, target, published, protocol }
}

function splitPortColons(body: string): string[] {
  if (body.startsWith('[')) {
    const close = body.indexOf(']')
    if (close > 0) {
      const host = body.slice(0, close + 1)
      const rest = body.slice(close + 1)
      if (rest.startsWith(':')) {
        return [host, ...rest.slice(1).split(':')]
      }
      return [host]
    }
  }
  return body.split(':')
}

function volumeTargetKey(entry: unknown): string | null {
  if (typeof entry === 'string') {
    const parts = entry.split(':')
    if (parts.length === 1) return parts[0] ?? null
    return parts[1] ?? null
  }
  if (!isPlainObject(entry)) return null
  if (typeof entry.target === 'string') return entry.target
  return null
}

function secretConfigKey(entry: unknown): string | null {
  if (typeof entry === 'string') return entry
  if (!isPlainObject(entry)) return null
  if (typeof entry.target === 'string' && entry.target.length > 0) {
    return entry.target
  }
  if (typeof entry.source === 'string') return entry.source
  return null
}

/**
 * KEY=value / KEY:value → KEY; bare KEY → itself.
 */
function keyedListKey(entry: unknown): string | null {
  if (typeof entry !== 'string') return null
  const eq = entry.indexOf('=')
  const colon = entry.indexOf(':')
  let sep = -1
  if (eq >= 0 && colon >= 0) sep = Math.min(eq, colon)
  else if (eq >= 0) sep = eq
  else if (colon >= 0) sep = colon
  if (sep < 0) return entry
  return entry.slice(0, sep)
}

/**
 * Normalize list (`KEY=value`) and map forms of labels/environment/depends_on/
 * extra_hosts into a single mapping so the two forms cannot dual-key.
 */
function normalizeKeyedList(value: unknown): Record<string, unknown> | null {
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      out[key] = child
    }
    return out
  }
  if (!Array.isArray(value)) return null
  const out: Record<string, unknown> = {}
  for (const item of value) {
    if (typeof item !== 'string') continue
    const eq = item.indexOf('=')
    const colon = item.indexOf(':')
    let sep = -1
    if (eq >= 0 && colon >= 0) sep = Math.min(eq, colon)
    else if (eq >= 0) sep = eq
    else if (colon >= 0) sep = colon
    if (sep < 0) {
      out[item] = null
      continue
    }
    const key = item.slice(0, sep)
    const rest = item.slice(sep + 1)
    out[key] = rest
  }
  return out
}

/**
 * Overlay index → result index for presentation path shifts.
 * Missing overlay indices were deduplicated away (drop their comments).
 */
type OverlayIndexMap = Map<number, number>

type SequenceMergeResult = {
  value: unknown[]
  /**
   * Overlay index → merged result index.
   * `null` = wholesale replace (keep overlay indices 1:1, no shift).
   */
  overlayIndexMap: OverlayIndexMap | null
}

function appendWithUniqueKey(
  base: unknown[],
  overlay: unknown[],
  keyOf: (entry: unknown) => string | null,
): SequenceMergeResult {
  const out = [...base]
  const indexByKey = new Map<string, number>()
  for (let i = 0; i < out.length; i++) {
    const key = keyOf(out[i])
    if (key !== null) indexByKey.set(key, i)
  }
  const overlayIndexMap: OverlayIndexMap = new Map()
  for (let oi = 0; oi < overlay.length; oi++) {
    const entry = overlay[oi]
    const key = keyOf(entry)
    if (key === null) {
      overlayIndexMap.set(oi, out.length)
      out.push(entry)
      continue
    }
    const existing = indexByKey.get(key)
    if (existing === undefined) {
      indexByKey.set(key, out.length)
      overlayIndexMap.set(oi, out.length)
      out.push(entry)
    } else {
      out[existing] = entry
      overlayIndexMap.set(oi, existing)
    }
  }
  return { value: out, overlayIndexMap }
}

function appendScalarDedup(
  base: unknown[],
  overlay: unknown[],
): SequenceMergeResult {
  const out = [...base]
  const seen = new Set<string>()
  for (const item of out) {
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      seen.add(String(item))
    } else {
      seen.add(JSON.stringify(item))
    }
  }
  const overlayIndexMap: OverlayIndexMap = new Map()
  for (let oi = 0; oi < overlay.length; oi++) {
    const item = overlay[oi]
    const key =
      typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
        ? String(item)
        : JSON.stringify(item)
    if (seen.has(key)) continue
    seen.add(key)
    overlayIndexMap.set(oi, out.length)
    out.push(item)
  }
  return { value: out, overlayIndexMap }
}

function appendKeyedList(
  base: unknown[],
  overlay: unknown[],
): SequenceMergeResult {
  return appendWithUniqueKey(base, overlay, keyedListKey)
}

function plainAppend(base: unknown[], overlay: unknown[]): SequenceMergeResult {
  const overlayIndexMap: OverlayIndexMap = new Map()
  for (let oi = 0; oi < overlay.length; oi++) {
    overlayIndexMap.set(oi, base.length + oi)
  }
  return { value: [...base, ...overlay], overlayIndexMap }
}

function mergeSequences(
  base: unknown[],
  overlay: unknown[],
  path: MergePath,
): SequenceMergeResult {
  const strategy = resolveSequenceStrategy(path)
  switch (strategy) {
    case 'replace':
      return { value: [...overlay], overlayIndexMap: null }
    case 'ports':
      return appendWithUniqueKey(base, overlay, portUniqueKey)
    case 'volumes':
      return appendWithUniqueKey(base, overlay, volumeTargetKey)
    case 'secrets_configs':
      return appendWithUniqueKey(base, overlay, secretConfigKey)
    case 'scalar_dedup':
      return appendScalarDedup(base, overlay)
    case 'keyed_list':
      return appendKeyedList(base, overlay)
    default:
      return plainAppend(base, overlay)
  }
}

/**
 * Presentation-path prefix → overlay-index map for sequence merges that do not
 * fully replace. Absent paths keep overlay indices as authored (replace).
 */
type SequenceIndexMaps = Map<string, OverlayIndexMap>

const DELETE_KEY = Symbol('compose.merge.delete')

/**
 * Sentinel returned by {@link mergeMapListDuality} when `attr`/`base`/
 * `overlay` do not qualify for the labels/environment/depends_on/extra_hosts
 * map-vs-list normalization — caller falls through to the plain merge paths.
 */
const NO_DUALITY_MERGE = Symbol('compose.merge.no-duality')

/**
 * Normalize a labels/environment/depends_on/extra_hosts attribute (which
 * Compose allows as either a list or a map) onto a single mapping so the two
 * authored forms never dual-key. Returns {@link NO_DUALITY_MERGE} when `attr`
 * is not one of those attributes, or when `base`/`overlay` aren't a
 * map/list pairing that needs normalizing.
 */
function mergeMapListDuality(
  attr: string,
  base: unknown,
  overlay: unknown,
  path: MergePath,
  sequenceIndexMaps: SequenceIndexMaps,
): Record<string, unknown> | typeof NO_DUALITY_MERGE {
  if (!MAP_LIST_DUALITY_ATTRS.has(attr)) return NO_DUALITY_MERGE
  const baseIsMapOrList = isPlainObject(base) || Array.isArray(base)
  const overlayIsMapOrList = isPlainObject(overlay) || Array.isArray(overlay)
  if (!baseIsMapOrList || !overlayIsMapOrList) return NO_DUALITY_MERGE
  if (!isPlainObject(base) && !isPlainObject(overlay)) return NO_DUALITY_MERGE

  const baseMap = normalizeKeyedList(base) ?? {}
  const overlayMap = normalizeKeyedList(overlay) ?? {}
  return mergeMappings(baseMap, overlayMap, path, sequenceIndexMaps)
}

function mergeArraySequences(
  base: unknown[],
  overlay: unknown[],
  path: MergePath,
  sequenceIndexMaps: SequenceIndexMaps,
): unknown[] {
  const merged = mergeSequences(base, overlay, path)
  if (merged.overlayIndexMap !== null) {
    sequenceIndexMaps.set(presentationPath(path), merged.overlayIndexMap)
  }
  return merged.value
}

/**
 * Merge one overlay node onto a base node at `path`.
 * Mutates `sequenceIndexMaps` whenever a sequence is append/dedup/replaced-key
 * merged (not wholesale `!override` / strategy replace).
 */
function mergeNodes(
  base: unknown,
  overlay: unknown,
  path: MergePath,
  sequenceIndexMaps: SequenceIndexMaps,
): unknown {
  if (overlay === undefined) return base

  if (isComposeTaggedValue(overlay)) {
    return composeTagOf(overlay) === 'reset' ? DELETE_KEY : resolveComposeTags(overlay)
  }

  if (isComposeTaggedValue(base)) {
    base = resolveComposeTags(base)
  }

  const duality = mergeMapListDuality(
    leafAttribute(path),
    base,
    overlay,
    path,
    sequenceIndexMaps,
  )
  if (duality !== NO_DUALITY_MERGE) return duality

  if (isPlainObject(base) && isPlainObject(overlay)) {
    return mergeMappings(base, overlay, path, sequenceIndexMaps)
  }

  if (Array.isArray(base) && Array.isArray(overlay)) {
    return mergeArraySequences(base, overlay, path, sequenceIndexMaps)
  }

  return overlay
}

function mergeMappings(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
  path: MergePath,
  sequenceIndexMaps: SequenceIndexMaps,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(overlay)) {
    if (value === undefined) continue
    const childPath = [...path, key]
    const existing = out[key]
    const merged = mergeNodes(existing, value, childPath, sequenceIndexMaps)
    if (merged === DELETE_KEY) {
      delete out[key]
      continue
    }
    out[key] = merged
  }
  return out
}

function mergeKeyOrder(
  baseOrder: string[],
  overlayOrder: string[],
  merged: Record<string, unknown>,
): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const key of [...baseOrder, ...overlayOrder]) {
    if (seen.has(key) || !(key in merged)) continue
    seen.add(key)
    result.push(key)
  }
  for (const key of Object.keys(merged)) {
    if (seen.has(key)) continue
    result.push(key)
  }
  return result
}

const INDEXED_PATH_RE = /^(.*?)\[(\d+)\](.*)$/

/**
 * Remap overlay sequence-item comment/blank-line keys after sequence merge so
 * comments stay attached to the resulting index (append / in-place replace) and
 * are dropped when the overlay entry was deduplicated away.
 */
function shiftPresentationPaths(
  overlayPaths: Record<string, unknown>,
  sequenceIndexMaps: SequenceIndexMaps,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [rawPath, value] of Object.entries(overlayPaths)) {
    const keySuffix = rawPath.endsWith('#key')
    const path = keySuffix ? rawPath.slice(0, -4) : rawPath
    const shifted = shiftIndexedPath(path, sequenceIndexMaps)
    if (shifted === null) continue
    const nextKey = keySuffix ? `${shifted}#key` : shifted
    out[nextKey] = value
  }
  return out
}

/**
 * @returns remapped path, or `null` when the overlay entry was dropped.
 */
function shiftIndexedPath(
  path: string,
  sequenceIndexMaps: SequenceIndexMaps,
): string | null {
  const match = INDEXED_PATH_RE.exec(path)
  if (!match) return path
  const prefix = match[1] ?? ''
  const index = Number(match[2])
  const rest = match[3] ?? ''
  const indexMap = sequenceIndexMaps.get(prefix)
  if (indexMap === undefined || !Number.isFinite(index)) return path
  const mapped = indexMap.get(index)
  if (mapped === undefined) return null
  return `${prefix}[${mapped}]${rest}`
}

function mergePresentation(
  base: ComposePresentation,
  overlay: ComposePresentation,
  mergedData: Record<string, unknown>,
  sequenceIndexMaps: SequenceIndexMaps,
): ComposePresentation {
  const keyOrder = mergeKeyOrder(base.keyOrder, overlay.keyOrder, mergedData)

  const shiftedComments = shiftPresentationPaths(
    overlay.comments as Record<string, unknown>,
    sequenceIndexMaps,
  ) as Record<string, ComposeComment>

  const comments = {
    ...base.comments,
    ...shiftedComments,
  }

  const baseBlanks = base.blankLines ?? {}
  const overlayBlanks = (overlay.blankLines ?? {}) as Record<string, unknown>
  const shiftedBlanks = shiftPresentationPaths(
    overlayBlanks,
    sequenceIndexMaps,
  ) as Record<string, number>
  const blankLines = { ...baseBlanks, ...shiftedBlanks }

  const documentCommentBefore =
    base.documentCommentBefore ?? overlay.documentCommentBefore
  const documentComment = base.documentComment ?? overlay.documentComment
  const editorView = overlay.editorView ?? base.editorView

  return {
    keyOrder,
    comments,
    ...(Object.keys(blankLines).length > 0 ? { blankLines } : {}),
    ...(documentCommentBefore ? { documentCommentBefore } : {}),
    ...(documentComment ? { documentComment } : {}),
    ...(editorView ? { editorView } : {}),
  }
}

/**
 * Unwrap every `!reset` / `!override` in a document's data tree.
 * Base / first-layer tags have no Compose merge effect and must not appear in
 * the effective document.
 */
function resolveDocumentTags(doc: ComposeDocument): ComposeDocument {
  const resolved = resolveComposeTags(doc.data)
  if (!isPlainObject(resolved)) {
    return {
      version: 1,
      data: {},
      presentation: doc.presentation,
    }
  }
  return {
    version: 1,
    data: resolved,
    presentation: doc.presentation,
  }
}

/**
 * Deep-merge environment overlay onto project base compose.
 * - `!reset` removes a key; `!override` replaces wholesale
 * - Mappings merge recursively; sequences follow Compose Spec strategies
 * - Presentation: base for untouched paths; overlay wins on overlay keys;
 *   sequence-item comment paths remap via overlay-index maps
 * - Base-layer tags are always unwrapped (no effect; no leak into effective YAML)
 */
export function mergeComposeOverlay(
  base: unknown,
  overlay: unknown,
): ComposeDocument {
  const baseDoc = resolveDocumentTags(normalizeCompose(base))
  if (overlay == null) return baseDoc
  const overlayDoc = normalizeCompose(overlay)

  if (
    isBlankComposeData(overlayDoc.data) &&
    Object.keys(overlayDoc.presentation.comments).length === 0
  ) {
    return baseDoc
  }

  const sequenceIndexMaps: SequenceIndexMaps = new Map()
  const mergedData = mergeMappings(
    baseDoc.data,
    overlayDoc.data,
    [],
    sequenceIndexMaps,
  )

  const presentation = mergePresentation(
    baseDoc.presentation,
    overlayDoc.presentation,
    mergedData,
    sequenceIndexMaps,
  )

  return {
    version: 1,
    data: mergedData,
    presentation,
  }
}

/** Mirror of instance `src/lib/compose/placement.ts`. */
export const TURBOPANEL_EXTENSION_KEY = 'x-turbopanel'

export type ComposeTurbopanelExtension = {
  placement?: { server_id?: string }
}

function stripTurbopanelField(
  document: ComposeDocument,
  field: string,
): ComposeDocument {
  const normalized = normalizeCompose(document)
  const extension = normalized.data[TURBOPANEL_EXTENSION_KEY]
  if (!isRecord(extension) || !(field in extension)) {
    return normalized
  }

  const { [field]: _removed, ...rest } = extension
  const data = { ...normalized.data }
  const keyOrder = [...normalized.presentation.keyOrder]

  if (Object.keys(rest).length === 0) {
    delete data[TURBOPANEL_EXTENSION_KEY]
    return {
      version: 1,
      data,
      presentation: buildPresentation(normalized.presentation, {
        keyOrder: keyOrder.filter((key) => key !== TURBOPANEL_EXTENSION_KEY),
        comments: { ...normalized.presentation.comments },
      }),
    }
  }

  data[TURBOPANEL_EXTENSION_KEY] = rest
  return {
    version: 1,
    data,
    presentation: buildPresentation(normalized.presentation, {
      keyOrder,
      comments: { ...normalized.presentation.comments },
    }),
  }
}

/**
 * Compose document for editor/preview UI: omit `x-turbopanel` placement.
 * Placement lives on `EnvironmentRecord.serverId`, never in compose. This is
 * an input-sanitization path only — it strips any placement a client might
 * still submit embedded in compose before it reaches the editor or save path.
 * Preserves any unrelated `x-turbopanel` fields.
 */
export function stripComposePlacement(document: ComposeDocument): ComposeDocument {
  return stripTurbopanelField(document, 'placement')
}

export function readComposeEditorView(
  document: ComposeDocument,
): ComposeEditorView | null {
  const normalized = normalizeCompose(document)
  return isComposeEditorView(normalized.presentation.editorView)
    ? normalized.presentation.editorView
    : null
}

export function setComposeEditorView(
  document: ComposeDocument,
  view: ComposeEditorView,
): ComposeDocument {
  const normalized = normalizeCompose(document)
  return {
    version: 1,
    data: { ...normalized.data },
    presentation: buildPresentation(
      normalized.presentation,
      {
        keyOrder: [...normalized.presentation.keyOrder],
        comments: { ...normalized.presentation.comments },
      },
      view,
    ),
  }
}

/**
 * Compose document for the YAML editor surface: native Docker Compose only.
 * Every `x-turbopanel` field (top-level and per-service) is managed by the
 * TurboPanel UI (Services tab / Server control) and is hidden from the text
 * surface. Placement is stripped as input sanitization first; the rest of the
 * extension tree is removed via {@link hideComposeTurbopanelExtensions}.
 * Editor view lives in `presentation.editorView` and is not part of compose YAML.
 */
export function stripComposeManagedExtension(
  document: ComposeDocument,
): ComposeDocument {
  return hideTurboExtensions(stripComposePlacement(document)).document
}

