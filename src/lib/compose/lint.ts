import {
  isMap,
  isSeq,
  LineCounter,
  parseDocument,
  type Node,
  type Scalar,
  type YAMLMap,
  type YAMLSeq,
} from 'yaml'
import { COMPOSE_CUSTOM_TAGS, isComposeTaggedValue } from './tags'
import { collectRootExtensionValidationIssues } from './root-extension'
import {
  collectServiceKindFieldIssues,
  type ComposeServiceKind,
  TURBOPANEL_SERVICE_EXTENSION_KEY,
} from './service-kind'
import {
  collectHostingExtensionValidationIssues,
  hostingIpRefUnresolvedMessage,
  hostingTlsRefUnresolvedMessage,
} from './hosting-extension'
import { parseExactVariableRef } from './variable-refs'
import {
  classifyDeployKey,
  classifyDeployResourcesKey,
  classifyNetworkKey,
  classifyServiceKey,
  classifyTopLevelKey,
  SERVICE_FIELD_KEYS,
  SPANNING_NETWORK_DRIVER,
  TOP_LEVEL_FIELD_KEYS,
  unsupportedDeployReason,
  unsupportedDeployResourcesReason,
  unsupportedNetworkReason,
} from './field-policy'

export type ComposeLintLevel = 'error' | 'warning'

/**
 * Machine-readable rule identity. Mirrors the instance type so a surface that
 * wants to act on *which* rule fired never has to match on message text.
 *
 * `turbofabric_required` names the note a `driver: overlay` network carries.
 * The refusal that shares its name lives on the instance's scheduler, which can
 * see the fabric row this pure linter cannot; the code exists so a surface can
 * style the note as what it is rather than parse the sentence.
 */
export type ComposeLintCode = 'field_unsupported' | 'turbofabric_required'

export type ComposeLintIssue = {
  level: ComposeLintLevel
  message: string
  /** Set only for rules a caller keys off; see {@link ComposeLintCode}. */
  code?: ComposeLintCode
  /** Dot-joined location within the compose tree (e.g. `services.nginx.imaage`). */
  path: string
  /** 1-based source line, when it can be resolved from the YAML. */
  line?: number
  /**
   * When false, never blocks save even if the level is `warning`/`error`.
   * Mirrors the instance field — used for advisory-only notes.
   */
  blocking?: false
}

/**
 * Optional UI-editor-only flags. The zero-arg lint still mirrors instance —
 * these options never affect server-side validation of the full document.
 */
export type ComposeLintOptions = {
  /**
   * Service names to treat as host-native (`site` / `node`) when the
   * visible text no longer carries `x-turbopanel.serviceKind` (hidden by the
   * YAML surface). Neither kind declares `image`/`build`.
   */
  siteServices?: readonly string[]
  /**
   * When true, warn on any author-typed `x-turbopanel` key — the block is
   * managed by TurboPanel and ignored/restored from the platform shadow.
   */
  managedExtensionHidden?: boolean
  /**
   * Repository ids known to the signed-in organization. Mirrors the instance
   * option: when omitted the `x-turbopanel.source.sourceId` resolution check is
   * skipped rather than false-flagging. The compose document key is
   * intentionally still `source`.
   */
  knownSourceIds?: ReadonlySet<string>
  /**
   * The repository this project is bound to. Mirrors the instance option: a
   * repository-backed project *is* its repository, so every
   * `x-turbopanel.source.sourceId` in the document has to name this row.
   *
   * `null` means the project has no binding yet and the rule weakens to "at
   * most one distinct id" — the save that introduces the first repository is
   * the one the project adopts it on. Omitted entirely skips the rule, the same
   * way {@link ComposeLintOptions.knownSourceIds} does, so a surface with no
   * project context never false-flags.
   */
  projectRepositoryId?: string | null
  /**
   * Every principal alias in scope for this document — its own root
   * `x-turbopanel.principals`, plus (for an overlay) the project base's.
   * Mirrors the instance option.
   *
   * Same contract as {@link ComposeLintOptions.knownSourceIds}: the linter is
   * pure, the surface assembles the set, and omitting it **skips** the rule
   * rather than false-flagging every service in a document whose sibling layer
   * the caller could not see.
   */
  knownPrincipalAliases?: ReadonlySet<string>
  /**
   * Every TLS row in scope for the signed-in organization, by id **and** by
   * name, for `x-turbopanel.hosting[i].tls.certificateRef`. Mirrors the
   * instance option: omitted **skips** the resolution rule rather than
   * false-flagging a ref this surface could not resolve.
   */
  knownTlsIds?: ReadonlySet<string>
  /**
   * Every managed address in scope, by id **and** by address, for
   * `x-turbopanel.hosting[i].bind.ipRef`. Same contract as
   * {@link ComposeLintOptions.knownTlsIds}.
   */
  knownIpIds?: ReadonlySet<string>
}

/**
 * Same token as the per-service key, spelled separately because the two name
 * different objects: the root block is the *authored* extension (`principals`),
 * the per-service one is `serviceKind` and its fields. Declared locally rather
 * than imported from `./index`, which imports this module.
 */
const TURBOPANEL_EXTENSION_KEY = 'x-turbopanel'

const MANAGED_EXTENSION_WARNING =
  'x-turbopanel is managed by TurboPanel, editable on the Services tab, and ignored here'

/**
 * Non-blocking notice. The block is no longer inert — deploy-prepare turns it
 * into `sourceMaterial[]` and the daemon builds and promotes a release — but it
 * still does not decide document roots or process supervision, so an author who
 * expects it to change how the service runs needs to hear that.
 */
const SOURCE_INERT_ADVISORY =
  'x-turbopanel.source builds and promotes a release, but does not yet change how this service is served or supervised'

function isExtensionKey(key: string): boolean {
  return key.startsWith('x-')
}

/** True for Compose top-level keys (`services`, `networks`, …). */
export function isComposeTopLevelKey(key: string): boolean {
  return classifyTopLevelKey(key) !== undefined
}

/**
 * Service-only keys (`restart`, `image`, …) — not also valid at the document root.
 * Used by the YAML editor to re-indent misplaced service properties on Enter.
 */
export function isComposeServicePropertyKey(key: string): boolean {
  return (
    classifyServiceKey(key) !== undefined && classifyTopLevelKey(key) === undefined
  )
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1
  const cols = b.length + 1
  const dist = Array.from({ length: rows }, () => new Array<number>(cols).fill(0))
  for (let i = 0; i < rows; i += 1) dist[i][0] = i
  for (let j = 0; j < cols; j += 1) dist[0][j] = j
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dist[i][j] = Math.min(
        dist[i - 1][j] + 1,
        dist[i][j - 1] + 1,
        dist[i - 1][j - 1] + cost,
      )
    }
  }
  return dist[a.length][b.length]
}

/** Nearest allowed key within edit distance 2, for "did you mean" hints. */
function suggestKey(key: string, allowed: Iterable<string>): string | null {
  let best: string | null = null
  let bestDistance = 3
  for (const candidate of allowed) {
    const distance = levenshtein(key, candidate)
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  }
  return best
}

function unknownKeyMessage(
  key: string,
  kind: string,
  allowed: Iterable<string>,
): string {
  const suggestion = suggestKey(key, allowed)
  const base = `Unknown ${kind} key "${key}"`
  return suggestion ? `${base} — did you mean "${suggestion}"?` : base
}

function nodeLine(
  node: Node | null | undefined,
  lineCounter: LineCounter,
): number | undefined {
  const range = (node as { range?: [number, number, number] } | null)?.range
  if (!range) return undefined
  return lineCounter.linePos(range[0]).line
}

function stringKey(key: unknown): string | null {
  if (key && typeof key === 'object' && 'value' in (key as object)) {
    const value = (key as { value: unknown }).value
    if (typeof value === 'string') return value
  }
  return null
}

function scalarString(node: Node | null | undefined): string | null {
  if (!node || typeof node !== 'object' || !('value' in node)) return null
  const value = (node as Scalar).value
  return typeof value === 'string' ? value : null
}

/** Raw scalar payload of a YAML node, or `undefined` when it is not a scalar. */
function scalarValueOf(node: Node | null | undefined): unknown {
  if (!node || typeof node !== 'object' || !('value' in node)) return undefined
  return (node as Scalar).value
}

/**
 * True when a key was typed with nothing under it (`x-turbopanel:`), which the
 * parser hands back as a null scalar rather than as a missing entry.
 */
function isNullValueNode(node: Node | null | undefined): boolean {
  if (node === null || node === undefined) return true
  if (typeof node !== 'object' || !('value' in node)) return false
  return (node as Scalar).value === null
}

/** True when an `image` key is present but empty/missing (not a real image ref). */
function isEmptyImageValue(node: Node | null | undefined): boolean {
  if (!node || typeof node !== 'object' || !('value' in node)) return false
  const value = (node as Scalar).value
  if (value === null || value === undefined) return true
  return typeof value === 'string' && value.trim().length === 0
}

/**
 * True when a YAML node is a Compose `!reset` / `!override` tag (or the
 * JS sentinel left after custom-tag resolve). Tagged values are lint-transparent.
 */
function isComposeTagNode(node: Node | null | undefined): boolean {
  if (!node || typeof node !== 'object') return false
  const tag = (node as { tag?: string }).tag
  if (tag === '!reset' || tag === '!override') return true
  if ('value' in node && isComposeTaggedValue((node as Scalar).value)) {
    return true
  }
  return isComposeTaggedValue(node)
}

/**
 * `image` / `build` is required only of Docker services — mirrors the instance
 * rule: sites are served by a host engine and `node` apps are
 * supervised from a Git release.
 */
const HOST_NATIVE_SERVICE_KINDS = new Set(['site', 'node'])

/**
 * Value of the first entry in `map` keyed `key`, or `undefined` when the key is
 * absent — distinct from a key present with a null value.
 */
function mapEntryValue(map: YAMLMap, key: string): Node | null | undefined {
  for (const item of map.items) {
    if (stringKey(item.key) === key) return item.value as Node | null
  }
  return undefined
}

/**
 * `x-turbopanel.source` on one service. `undefined` when the extension or the
 * `source` key is absent, or the extension itself is not a map.
 */
function serviceSourceEntry(valueNode: YAMLMap): Node | null | undefined {
  const extension = mapEntryValue(valueNode, TURBOPANEL_SERVICE_EXTENSION_KEY)
  if (!isMap(extension)) return undefined
  return mapEntryValue(extension, 'source')
}

function serviceIsHostNative(valueNode: YAMLMap): boolean {
  const extension = mapEntryValue(valueNode, TURBOPANEL_SERVICE_EXTENSION_KEY)
  if (!isMap(extension)) return false
  const kind = scalarString(mapEntryValue(extension, 'serviceKind'))
  return kind !== null && HOST_NATIVE_SERVICE_KINDS.has(kind)
}

/**
 * True for `serviceKind: node` specifically — narrower than
 * {@link serviceIsHostNative}, which also covers sites. Mirrors the instance
 * helper of the same name.
 *
 * The `deploy.restart_policy` rule needs the narrow question: a `node` service
 * is supervised by a generated systemd unit that can express only part of the
 * Compose vocabulary, while a site has no process of its own for a restart
 * policy to govern and a container service hands the whole block to Docker.
 */
function serviceIsNativeApp(valueNode: YAMLMap): boolean {
  const extension = mapEntryValue(valueNode, TURBOPANEL_SERVICE_EXTENSION_KEY)
  if (!isMap(extension)) return false
  return scalarString(mapEntryValue(extension, 'serviceKind'))?.trim() === 'node'
}

/**
 * True when `x-turbopanel.source.buildKind` is `railpack`.
 *
 * Deliberately a sibling of {@link serviceIsHostNative} rather than another
 * entry in {@link HOST_NATIVE_SERVICE_KINDS}: a Railpack service *is* a Docker
 * service — it just gets its `image` minted by the daemon at deploy time from
 * the image it built, so there is nothing for the author to type here.
 */
function serviceIsRailpackBuilt(valueNode: YAMLMap): boolean {
  const sourceNode = serviceSourceEntry(valueNode)
  if (!isMap(sourceNode)) return false
  const buildKind = mapEntryValue(sourceNode, 'buildKind')
  if (buildKind === undefined) return false
  return scalarString(buildKind)?.trim() === 'railpack'
}

/** Locate `x-turbopanel.source.sourceId` so issues can carry the author's line. */
function serviceSourceIdNode(
  valueNode: YAMLMap,
): { sourceId: string | null; node: Node | null } | null {
  const sourceNode = serviceSourceEntry(valueNode)
  if (sourceNode === undefined) return null
  if (!isMap(sourceNode)) return { sourceId: null, node: sourceNode }
  const sourceId = mapEntryValue(sourceNode, 'sourceId')
  if (sourceId === undefined) return { sourceId: null, node: sourceNode as Node }
  return { sourceId: scalarString(sourceId), node: sourceId }
}

/**
 * Mirrors the instance rule: a non-blocking "inert for now" advisory, plus a
 * blocking error when `knownSourceIds` was supplied and the id is not in it.
 */
function lintServiceSource(
  name: string,
  valueNode: YAMLMap,
  lineCounter: LineCounter,
  issues: ComposeLintIssue[],
  options?: ComposeLintOptions,
): void {
  const found = serviceSourceIdNode(valueNode)
  if (!found) return

  const line = nodeLine(found.node, lineCounter)
  issues.push({
    level: 'warning',
    message: SOURCE_INERT_ADVISORY,
    path: `services.${name}.x-turbopanel.source`,
    line,
    blocking: false,
  })

  const knownSourceIds = options?.knownSourceIds
  if (!knownSourceIds || found.sourceId === null) return
  const sourceId = found.sourceId.trim()
  if (sourceId.length === 0 || knownSourceIds.has(sourceId)) return

  issues.push({
    level: 'error',
    message: `source '${sourceId}' was not found for this organization`,
    path: `services.${name}.x-turbopanel.source.sourceId`,
    line,
  })
}

/**
 * Per-service `x-turbopanel` legality — the same per-kind rules the instance
 * enforces through `collectServiceTurbopanelValidationIssues`, so a document
 * the editor calls clean is one the save accepts. The rules themselves live in
 * `./service-kind`, next to the table they are derived from; this only turns
 * them into located issues.
 */
function lintServiceTurbopanelFields(
  name: string,
  valueNode: YAMLMap,
  serviceKeyLine: number | undefined,
  lineCounter: LineCounter,
  issues: ComposeLintIssue[],
  options?: ComposeLintOptions,
): void {
  // With the managed extension hidden, author-typed `x-turbopanel` is dropped
  // on save and already carries the warning that says so — rules about a block
  // nobody keeps would only be noise.
  if (options?.managedExtensionHidden) return

  const extensionNode = mapEntryValue(valueNode, TURBOPANEL_SERVICE_EXTENSION_KEY)
  if (extensionNode === undefined || isComposeTagNode(extensionNode)) return

  const basePath = `services.${name}.${TURBOPANEL_SERVICE_EXTENSION_KEY}`
  const keyLine = lineForPath(
    valueNode,
    [TURBOPANEL_SERVICE_EXTENSION_KEY],
    lineCounter,
    serviceKeyLine,
  )

  if (!isMap(extensionNode)) {
    // `x-turbopanel:` with nothing under it is a half-typed block, not a claim
    // about the service — the instance reads it as an empty extension too.
    if (isNullValueNode(extensionNode)) return
    issues.push({
      level: 'error',
      message: 'x-turbopanel must be a mapping',
      path: basePath,
      line: keyLine,
    })
    return
  }

  let plain: unknown
  try {
    plain = extensionNode.toJSON()
  } catch {
    // Unresolvable alias or cyclic anchor: the YAML parser already said so.
    return
  }
  if (plain === null || typeof plain !== 'object' || Array.isArray(plain)) return

  for (const issue of collectServiceKindFieldIssues(plain as Record<string, unknown>)) {
    issues.push({
      level: 'error',
      message: issue.message,
      path: `${basePath}.${issue.field}`,
      line: lineForPath(
        extensionNode,
        [issue.field],
        lineCounter,
        keyLine,
      ),
    })
  }
}

/**
 * Whether missing image/build is allowed. When the managed extension is hidden
 * from YAML, only the shadow-backed name list counts — author-typed
 * `x-turbopanel.serviceKind` is ignored on save and must not suppress lint.
 */
function isHostNativeForLint(
  name: string,
  valueNode: YAMLMap,
  options?: ComposeLintOptions,
): boolean {
  if (options?.siteServices?.includes(name)) return true
  if (options?.managedExtensionHidden) return false
  return serviceIsHostNative(valueNode)
}

function lintVariableRefScalar(
  raw: string,
  path: string,
  node: Node | null | undefined,
  lineCounter: LineCounter,
  issues: ComposeLintIssue[],
): void {
  const parsed = parseExactVariableRef(raw)
  if (parsed.ok || parsed.error === 'not_a_ref') return
  issues.push({
    level: 'error',
    message: parsed.message,
    path,
    line: nodeLine(node, lineCounter),
  })
}

function envSeqValueAfterSeparator(raw: string): string {
  const eq = raw.indexOf('=')
  const colon = raw.indexOf(':')
  if (eq < 0 && colon < 0) return ''
  if (eq < 0) return raw.slice(colon + 1)
  if (colon < 0) return raw.slice(eq + 1)
  return raw.slice(Math.min(eq, colon) + 1)
}

function lintEnvOrArgsMap(
  fieldPath: string,
  valueNode: YAMLMap,
  lineCounter: LineCounter,
  issues: ComposeLintIssue[],
): void {
  for (const item of valueNode.items) {
    const key = stringKey(item.key)
    const raw = scalarString(item.value as Node)
    if (key === null || raw === null) continue
    lintVariableRefScalar(
      raw,
      `${fieldPath}.${key}`,
      item.value as Node,
      lineCounter,
      issues,
    )
  }
}

function lintEnvOrArgsSeq(
  fieldPath: string,
  valueNode: YAMLSeq,
  lineCounter: LineCounter,
  issues: ComposeLintIssue[],
): void {
  for (const [index, item] of valueNode.items.entries()) {
    const raw = scalarString(item as Node)
    if (raw === null) continue
    lintVariableRefScalar(
      envSeqValueAfterSeparator(raw),
      `${fieldPath}[${index}]`,
      item as Node,
      lineCounter,
      issues,
    )
  }
}

function lintEnvOrArgsCollection(
  fieldPath: string,
  valueNode: Node | null | undefined,
  lineCounter: LineCounter,
  issues: ComposeLintIssue[],
): void {
  if (!valueNode || typeof valueNode !== 'object') return
  if (isMap(valueNode)) {
    lintEnvOrArgsMap(fieldPath, valueNode, lineCounter, issues)
    return
  }
  if (isSeq(valueNode)) {
    lintEnvOrArgsSeq(fieldPath, valueNode, lineCounter, issues)
  }
}

function lintBuildArgs(
  fieldPath: string,
  valueNode: Node | null | undefined,
  lineCounter: LineCounter,
  issues: ComposeLintIssue[],
): void {
  if (!isMap(valueNode)) return
  for (const item of valueNode.items) {
    if (stringKey(item.key) !== 'args') continue
    lintEnvOrArgsCollection(
      `${fieldPath}.args`,
      item.value as Node | null | undefined,
      lineCounter,
      issues,
    )
  }
}

function lintServicePropertyKey(
  path: string,
  key: string,
  valueNode: Node | null | undefined,
  keyLine: number | undefined,
  lineCounter: LineCounter,
  issues: ComposeLintIssue[],
  options?: ComposeLintOptions,
): { hasImage: boolean; hasBuild: boolean } {
  let hasImage = false
  let hasBuild = false

  if (isComposeTagNode(valueNode)) {
    // Tags replace content at merge time — count image/build as present.
    if (key === 'image') hasImage = true
    if (key === 'build') hasBuild = true
    return { hasImage, hasBuild }
  }

  if (key === 'image' && !isEmptyImageValue(valueNode)) {
    hasImage = true
  }
  if (key === 'build') hasBuild = true

  if (
    options?.managedExtensionHidden &&
    key === TURBOPANEL_SERVICE_EXTENSION_KEY
  ) {
    issues.push({
      level: 'warning',
      message: MANAGED_EXTENSION_WARNING,
      path: `${path}.${key}`,
      line: keyLine,
    })
    return { hasImage, hasBuild }
  }

  if (classifyServiceKey(key) === undefined && !isExtensionKey(key)) {
    issues.push({
      level: 'warning',
      message: unknownKeyMessage(key, 'service', SERVICE_FIELD_KEYS),
      path: `${path}.${key}`,
      line: keyLine,
    })
  }

  if (key === 'environment') {
    lintEnvOrArgsCollection(`${path}.${key}`, valueNode, lineCounter, issues)
  } else if (key === 'build') {
    lintBuildArgs(`${path}.${key}`, valueNode, lineCounter, issues)
  }

  return { hasImage, hasBuild }
}

function lintServiceKeys(
  path: string,
  valueNode: YAMLMap,
  lineCounter: LineCounter,
  issues: ComposeLintIssue[],
  options?: ComposeLintOptions,
): { hasImage: boolean; hasBuild: boolean } {
  let hasImage = false
  let hasBuild = false
  for (const item of valueNode.items) {
    const key = stringKey(item.key)
    if (key === null) continue
    const result = lintServicePropertyKey(
      path,
      key,
      item.value as Node | null | undefined,
      nodeLine(item.key as Node, lineCounter),
      lineCounter,
      issues,
      options,
    )
    if (result.hasImage) hasImage = true
    if (result.hasBuild) hasBuild = true
  }
  return { hasImage, hasBuild }
}

/**
 * `x-turbopanel.principal` must name an alias the document actually declares.
 * Mirrors the instance rule.
 *
 * Blocking, unlike the `source` advisory next door: an alias that resolves to
 * nothing is not an inert hint, it is a service with no account to run as, and
 * the only other place it surfaces is deploy-prepare — after the operator has
 * pressed Deploy.
 */
function lintServicePrincipal(
  name: string,
  valueNode: YAMLMap,
  lineCounter: LineCounter,
  issues: ComposeLintIssue[],
  options?: ComposeLintOptions,
): void {
  const knownPrincipalAliases = options?.knownPrincipalAliases
  if (!knownPrincipalAliases) return
  const extension = mapEntryValue(valueNode, TURBOPANEL_SERVICE_EXTENSION_KEY)
  if (!isMap(extension)) return
  const aliasNode = mapEntryValue(extension, 'principal')
  const alias = scalarString(aliasNode)
  if (alias === null) return
  const trimmed = alias.trim()
  if (trimmed.length === 0 || knownPrincipalAliases.has(trimmed)) return

  issues.push({
    level: 'error',
    message: `principal '${trimmed}' is not declared in this document's x-turbopanel.principals`,
    path: `services.${name}.x-turbopanel.principal`,
    line: nodeLine(aliasNode ?? undefined, lineCounter),
  })
}

/**
 * `x-turbopanel.hosting` — the editor half of the instance's hosting rules.
 *
 * Two kinds of rule, gated differently on purpose:
 *
 * - **Pure shape** (hostname, path prefix, `targetPort` on a site, unknown
 *   keys, TLS/bind blocks) comes straight from
 *   {@link collectHostingExtensionValidationIssues} in `./hosting-extension`,
 *   the same function the instance validates with, so the two cannot drift.
 * - **Resolution** (`tls.certificateRef`, `bind.ipRef`) runs only when the
 *   surface supplied the matching set, exactly like `knownSourceIds`: omitted
 *   means skipped, never false-flagged.
 */
function lintServiceHosting(
  name: string,
  valueNode: YAMLMap,
  serviceKeyLine: number | undefined,
  lineCounter: LineCounter,
  issues: ComposeLintIssue[],
  options?: ComposeLintOptions,
): void {
  // With the managed extension hidden, author-typed `x-turbopanel` is dropped
  // on save and already carries the warning that says so.
  if (options?.managedExtensionHidden) return

  const extensionNode = mapEntryValue(valueNode, TURBOPANEL_EXTENSION_KEY)
  if (!isMap(extensionNode)) return
  const hostingNode = mapEntryValue(extensionNode, 'hosting')
  if (hostingNode === undefined || isComposeTagNode(hostingNode)) return

  const basePath = `services.${name}.${TURBOPANEL_EXTENSION_KEY}`
  const hostingLine = lineForPath(
    valueNode,
    [TURBOPANEL_EXTENSION_KEY, 'hosting'],
    lineCounter,
    serviceKeyLine,
  )

  let plain: unknown
  try {
    plain = hostingNode === null ? null : (hostingNode as Node & { toJSON(): unknown }).toJSON()
  } catch {
    // Unresolvable alias or cyclic anchor: the YAML parser already said so.
    return
  }

  const serviceKind = readServiceKindForHosting(extensionNode)
  for (
    const issue of collectHostingExtensionValidationIssues(
      basePath,
      plain,
      serviceKind,
    )
  ) {
    issues.push({
      level: 'error',
      message: issue.message,
      path: issue.path,
      line: hostingEntryLine(hostingNode, issue.path, lineCounter, hostingLine),
    })
  }

  lintHostingRefs(basePath, hostingNode, lineCounter, issues, options)
}

/** `serviceKind` as authored, so the site-only `targetPort` rule can fire. */
function readServiceKindForHosting(
  extensionNode: YAMLMap,
): ComposeServiceKind | undefined {
  const raw = scalarString(mapEntryValue(extensionNode, 'serviceKind'))?.trim()
  if (raw === 'site' || raw === 'node' || raw === 'container') return raw
  return undefined
}

/**
 * The line of `hosting[<i>]` for an issue path, falling back to the block's own
 * line. Only the entry index is resolved, not the key inside it: the paths this
 * walks are already precise enough to read, and pointing at the right entry is
 * what makes the squiggle land in the right place.
 */
function hostingEntryLine(
  hostingNode: Node | null | undefined,
  issuePath: string,
  lineCounter: LineCounter,
  fallback: number | undefined,
): number | undefined {
  const match = /\.hosting\[(\d+)\]/.exec(issuePath)
  if (!match || !isSeq(hostingNode)) return fallback
  const item = (hostingNode as YAMLSeq).items[Number(match[1])]
  if (item === undefined) return fallback
  return nodeLine(item as Node, lineCounter) ?? fallback
}

function lintHostingRefs(
  basePath: string,
  hostingNode: Node | null | undefined,
  lineCounter: LineCounter,
  issues: ComposeLintIssue[],
  options?: ComposeLintOptions,
): void {
  if (!isSeq(hostingNode)) return
  for (const [index, item] of (hostingNode as YAMLSeq).items.entries()) {
    if (!isMap(item)) continue
    const entry = item as YAMLMap
    lintHostingRef({
      path: `${basePath}.hosting[${index}].tls.certificateRef`,
      refNode: nestedEntryValue(entry, 'tls', 'certificateRef'),
      resolvable: options?.knownTlsIds,
      message: hostingTlsRefUnresolvedMessage,
      lineCounter,
      issues,
    })
    lintHostingRef({
      path: `${basePath}.hosting[${index}].bind.ipRef`,
      refNode: nestedEntryValue(entry, 'bind', 'ipRef'),
      resolvable: options?.knownIpIds,
      message: hostingIpRefUnresolvedMessage,
      lineCounter,
      issues,
    })
  }
}

/** `entry.<block>.<key>` when both levels are maps, else undefined. */
function nestedEntryValue(
  entry: YAMLMap,
  block: string,
  key: string,
): Node | null | undefined {
  const blockNode = mapEntryValue(entry, block)
  if (!isMap(blockNode)) return undefined
  return mapEntryValue(blockNode as YAMLMap, key)
}

function lintHostingRef(params: {
  path: string
  refNode: Node | null | undefined
  resolvable: ReadonlySet<string> | undefined
  message: (ref: string) => string
  lineCounter: LineCounter
  issues: ComposeLintIssue[]
}): void {
  const { path, refNode, resolvable, message, lineCounter, issues } = params
  if (!resolvable) return
  const raw = scalarString(refNode)
  if (raw === null) return
  const ref = raw.trim()
  if (ref.length === 0 || resolvable.has(ref)) return
  issues.push({
    level: 'error',
    message: message(ref),
    path,
    line: nodeLine(refNode ?? undefined, lineCounter),
  })
}

/**
 * `deploy.mode` values naming a controller TurboPanel does not have.
 *
 * Mirrors the instance rule (`src/lib/compose/lint.ts`), minus its posture
 * switch. Swarm's two **job** modes are finite work — tasks run to completion
 * and the service is done — while TurboPanel schedules long-running replicas it
 * restarts when they exit, and its scheduler folds every non-`global` value
 * into `replicated`. Refused by **value**, not by key: `mode` itself is
 * honoured, so `./field-policy` keeps it `interpreted`.
 */
const UNSUPPORTED_DEPLOY_MODES: ReadonlySet<string> = new Set([
  'replicated-job',
  'global-job',
])

function lintDeployMode(
  name: string,
  valueNode: Node | null | undefined,
  lineCounter: LineCounter,
  issues: ComposeLintIssue[],
): void {
  if (isComposeTagNode(valueNode)) return
  const value = scalarString(valueNode)?.trim()
  if (value === undefined || !UNSUPPORTED_DEPLOY_MODES.has(value)) return

  issues.push({
    level: 'warning',
    code: 'field_unsupported',
    message:
      `deploy.mode: ${value} is not supported by TurboPanel \u2014 replicated-job and ` +
      'global-job need a finite-job controller with completion semantics, and ' +
      'TurboPanel schedules long-running replicas it restarts when they exit',
    path: `services.${name}.deploy.mode`,
    line: nodeLine(valueNode, lineCounter),
    blocking: false,
  })
}

/**
 * Classify every key under `services.<name>.deploy.resources`.
 *
 * Mirrors the instance rule. The parent `resources` key is passthrough — both
 * engines act on `limits` — so the per-key pass over `deploy:` says nothing
 * about it, and the one sub-key TurboPanel cannot honour would sail through
 * with it. `reservations` is a scheduler admission requirement with no per-host
 * capacity inventory to admit against, so placement would ignore it entirely.
 */
function lintDeployResources(
  name: string,
  resourcesNode: Node | null | undefined,
  lineCounter: LineCounter,
  issues: ComposeLintIssue[],
): void {
  if (!isMap(resourcesNode) || isComposeTagNode(resourcesNode)) return

  for (const item of (resourcesNode as YAMLMap).items) {
    const key = stringKey(item.key)
    if (key === null || isExtensionKey(key)) continue
    if (classifyDeployResourcesKey(key)?.state !== 'unsupported') continue
    const reason = unsupportedDeployResourcesReason(key)
    issues.push({
      level: 'warning',
      code: 'field_unsupported',
      message: `deploy.resources.${key} is not supported by TurboPanel${
        reason ? ` \u2014 ${reason}` : ''
      }`,
      path: `services.${name}.deploy.resources.${key}`,
      line: nodeLine(item.key as Node, lineCounter),
      blocking: false,
    })
  }
}

/**
 * `deploy.restart_policy` values a generated systemd unit cannot express.
 *
 * Mirrors the instance rule, minus its posture switch. A `serviceKind: node`
 * service is pulled out of the compose document entirely and supervised by a
 * generated unit, so this key is the one place TurboPanel *translates* it
 * instead of handing it to Docker: `condition` becomes `Restart=`, `delay`
 * becomes `RestartSec=`, `max_attempts` becomes `StartLimitBurst=` and `window`
 * becomes `StartLimitIntervalSec=`.
 *
 * `max_attempts: 0` is the sharpest case: `StartLimitBurst=0` means *no* rate
 * limit to systemd, the exact opposite of "do not retry". Container services
 * are untouched — Docker reads the whole Compose vocabulary itself.
 *
 * The grammar is the instance's `NATIVE_APP_RESTART_CONDITIONS` /
 * `isNativeAppRestartDuration` (`src/lib/compose/native-app.ts`), restated here
 * because the two surfaces ship separately and cannot import across the
 * boundary.
 */
const NATIVE_RESTART_CONDITIONS: ReadonlySet<string> = new Set([
  'none',
  'on-failure',
  'any',
])

/** Compose duration: one or more `<number><unit>` pairs (`5s`, `1m30s`). */
const NATIVE_RESTART_DURATION_RE = /^(\d+(?:\.\d+)?(?:us|ms|s|m|h))+$/

function nativeRestartExpectation(key: string, value: unknown): string | null {
  if (key === 'condition') {
    if (
      typeof value === 'string' && NATIVE_RESTART_CONDITIONS.has(value.trim())
    ) {
      return null
    }
    return `must be one of ${[...NATIVE_RESTART_CONDITIONS].join(', ')}`
  }
  if (key === 'delay' || key === 'window') {
    if (
      typeof value === 'string' && NATIVE_RESTART_DURATION_RE.test(value.trim())
    ) {
      return null
    }
    return 'must be a Compose duration such as 5s or 1m30s'
  }
  if (key === 'max_attempts') {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 1) {
      return null
    }
    if (
      typeof value === 'string' && /^\d+$/.test(value.trim()) &&
      Number.parseInt(value.trim(), 10) >= 1
    ) {
      return null
    }
    return 'must be a whole number of at least 1 \u2014 0 would render as StartLimitBurst=0, which systemd reads as no rate limit at all, the opposite of "do not retry"'
  }
  return null
}

function lintNativeRestartPolicy(
  name: string,
  restartPolicyNode: Node | null | undefined,
  lineCounter: LineCounter,
  issues: ComposeLintIssue[],
): void {
  if (!isMap(restartPolicyNode) || isComposeTagNode(restartPolicyNode)) return

  for (const item of (restartPolicyNode as YAMLMap).items) {
    const key = stringKey(item.key)
    if (key === null || isExtensionKey(key)) continue
    const valueNode = item.value as Node | null | undefined
    if (isComposeTagNode(valueNode)) continue
    if (valueNode === null || valueNode === undefined) continue
    if (isMap(valueNode) || isSeq(valueNode)) continue

    const value = scalarValueOf(valueNode)
    // A placeholder stands for a value no linter can see; the instance
    // substitutes it and checks the compiled document after that.
    if (
      typeof value === 'string' &&
      (value.includes('${') || value.includes('{$'))
    ) {
      continue
    }

    const expectation = nativeRestartExpectation(key, value)
    if (expectation === null) continue
    issues.push({
      level: 'warning',
      code: 'field_unsupported',
      message:
        `deploy.restart_policy.${key} is not supported by TurboPanel on a ` +
        `serviceKind: node service \u2014 the generated systemd unit ${expectation}`,
      path: `services.${name}.deploy.restart_policy.${key}`,
      line: nodeLine(valueNode, lineCounter),
      blocking: false,
    })
  }
}

/**
 * Classify every key under `services.<name>.deploy` through `./field-policy`.
 *
 * Mirrors the instance rule, minus its posture switch: the editor is always
 * save-time, so this is always advice — a non-blocking warning that leaves the
 * draft editable. Deploys are validated on the server, where the same registry
 * turns the same finding into a refusal.
 *
 * `passthrough` and `interpreted` keys pass in silence; an *unknown* key is
 * left to the instance's vendored Compose Specification stage, which this
 * surface does not carry. Only `unsupported` is reported, because before the
 * registry existed those fields were deleted during compile with nothing said
 * about it anywhere.
 *
 * Three keys are also checked below the key level — a supported key can still
 * be given a value, or a sub-key, this platform would quietly turn into
 * something else: {@link lintDeployMode}, {@link lintDeployResources} and, on
 * `serviceKind: node` services only, {@link lintNativeRestartPolicy}.
 */
function lintDeployBlock(
  name: string,
  deployNode: Node | null | undefined,
  nativeApp: boolean,
  lineCounter: LineCounter,
  issues: ComposeLintIssue[],
): void {
  // A tagged `deploy:` is an overlay instruction; the merged result is linted
  // where the merge happens.
  if (!isMap(deployNode) || isComposeTagNode(deployNode)) return

  for (const item of (deployNode as YAMLMap).items) {
    const key = stringKey(item.key)
    if (key === null || isExtensionKey(key)) continue
    if (key === 'mode') {
      lintDeployMode(
        name,
        item.value as Node | null | undefined,
        lineCounter,
        issues,
      )
    }
    if (key === 'resources') {
      lintDeployResources(
        name,
        item.value as Node | null | undefined,
        lineCounter,
        issues,
      )
    }
    if (key === 'restart_policy' && nativeApp) {
      lintNativeRestartPolicy(
        name,
        item.value as Node | null | undefined,
        lineCounter,
        issues,
      )
    }
    if (classifyDeployKey(key)?.state !== 'unsupported') continue
    const reason = unsupportedDeployReason(key)
    issues.push({
      level: 'warning',
      code: 'field_unsupported',
      message: `deploy.${key} is not supported by TurboPanel${
        reason ? ` \u2014 ${reason}` : ''
      }`,
      path: `services.${name}.deploy.${key}`,
      line: nodeLine(item.key as Node, lineCounter),
      blocking: false,
    })
  }
}

/**
 * The advisory every `driver: overlay` network carries.
 *
 * The editor has no fabric-enablement context at all — it lints text, not an
 * organization — so this can only ever be a note. The real refusal is
 * `turbofabric_required` on the instance's scheduler, which has the fabric row
 * in hand; this says what the driver value now means while there is still time
 * to change it.
 */
const TURBOFABRIC_OVERLAY_ADVISORY =
  'driver: overlay makes this a TurboFabric spanning network \u2014 the organization needs TurboFabric enabled before an environment can join it across more than one server'

/**
 * Classify every key under one top-level `networks.<key>` entry.
 *
 * Mirrors the instance rule, minus its posture switch. Scoped to
 * overlay-declared networks on purpose: a `bridge` or default network is handed
 * to Docker whole and `./field-policy` keeps every attribute `passthrough` for
 * it, so flagging `ipam` there would warn about documents that work. A network
 * declared `driver: overlay` is the one TurboPanel *substitutes* — it becomes a
 * platform-owned network whose per-host segments compile to `external: true` +
 * `name: tpn_<networkId>` — so the five attributes an overlay driver would have
 * read — `internal` among them — have nothing left to read them.
 */
function lintNetworkEntry(
  key: string,
  entryNode: Node | null | undefined,
  lineCounter: LineCounter,
  issues: ComposeLintIssue[],
): void {
  // A tagged entry is an overlay instruction; the merged result is linted
  // where the merge happens.
  if (!isMap(entryNode) || isComposeTagNode(entryNode)) return

  const driverNode = mapEntryValue(entryNode as YAMLMap, 'driver')
  const driver = scalarString(driverNode)?.trim()
  if (driver !== SPANNING_NETWORK_DRIVER) return

  issues.push({
    level: 'warning',
    code: 'turbofabric_required',
    message: `networks.${key}.${TURBOFABRIC_OVERLAY_ADVISORY}`,
    path: `networks.${key}.driver`,
    line: nodeLine(driverNode as Node, lineCounter),
    // Never a refusal from here: the editor cannot see the fabric row.
    blocking: false,
  })

  for (const item of (entryNode as YAMLMap).items) {
    const field = stringKey(item.key)
    if (field === null || isExtensionKey(field)) continue
    if (classifyNetworkKey(field, driver)?.state !== 'unsupported') continue
    const reason = unsupportedNetworkReason(field, driver)
    const reasonSuffix = reason ? ` \u2014 ${reason}` : ''
    issues.push({
      level: 'warning',
      code: 'field_unsupported',
      message:
        `networks.${key}.${field} is not supported by TurboPanel on a ` +
        `driver: overlay network${reasonSuffix}`,
      path: `networks.${key}.${field}`,
      line: nodeLine(item.key as Node, lineCounter),
      blocking: false,
    })
  }
}

/** Run {@link lintNetworkEntry} over every top-level `networks:` entry. */
function lintNetworks(
  networksNode: Node | null | undefined,
  lineCounter: LineCounter,
  issues: ComposeLintIssue[],
): void {
  if (!isMap(networksNode) || isComposeTagNode(networksNode)) return
  for (const item of (networksNode as YAMLMap).items) {
    const key = stringKey(item.key)
    if (key === null || isExtensionKey(key)) continue
    lintNetworkEntry(
      key,
      item.value as Node | null | undefined,
      lineCounter,
      issues,
    )
  }
}

function lintService(
  name: string,
  valueNode: Node | null | undefined,
  keyLine: number | undefined,
  lineCounter: LineCounter,
  issues: ComposeLintIssue[],
  options?: ComposeLintOptions,
): void {
  const path = `services.${name}`
  // `!reset` / `!override` on a service value is intentional; shape may be null.
  if (isComposeTagNode(valueNode)) return
  if (!isMap(valueNode)) {
    issues.push({
      level: 'error',
      message: `Service "${name}" must be a mapping`,
      path,
      line: keyLine,
    })
    return
  }

  const { hasImage, hasBuild } = lintServiceKeys(
    path,
    valueNode,
    lineCounter,
    issues,
    options,
  )

  lintDeployBlock(
    name,
    mapEntryValue(valueNode, 'deploy'),
    serviceIsNativeApp(valueNode),
    lineCounter,
    issues,
  )
  lintServiceSource(name, valueNode, lineCounter, issues, options)
  lintServicePrincipal(name, valueNode, lineCounter, issues, options)
  lintServiceHosting(name, valueNode, keyLine, lineCounter, issues, options)
  lintServiceTurbopanelFields(
    name,
    valueNode,
    keyLine,
    lineCounter,
    issues,
    options,
  )

  if (
    !isHostNativeForLint(name, valueNode, options) &&
    !serviceIsRailpackBuilt(valueNode) &&
    !hasImage &&
    !hasBuild
  ) {
    issues.push({
      level: 'error',
      message: `Service "${name}" must define "image" or "build"`,
      path,
      line: keyLine,
    })
  }
}

function lintServices(
  servicesNode: Node | null | undefined,
  servicesKeyLine: number | undefined,
  lineCounter: LineCounter,
  issues: ComposeLintIssue[],
  options?: ComposeLintOptions,
): void {
  if (isComposeTagNode(servicesNode)) return
  if (!isMap(servicesNode)) {
    issues.push({
      level: 'error',
      message: '"services" must be a mapping',
      path: 'services',
      line: servicesKeyLine,
    })
    return
  }

  if (servicesNode.items.length === 0) {
    issues.push({
      level: 'warning',
      message: 'No services defined',
      path: 'services',
      line: servicesKeyLine,
    })
    return
  }

  for (const item of servicesNode.items) {
    const name = stringKey(item.key)
    if (name === null) continue
    lintService(
      name,
      item.value as Node | null | undefined,
      nodeLine(item.key as Node, lineCounter),
      lineCounter,
      issues,
      options,
    )
  }
}

/**
 * Best-effort source line for a dot path under `node`, so a root-extension
 * diagnostic lands on the key the author actually typed rather than on the
 * block. Falls back to the deepest key it could resolve.
 */
function lineForPath(
  node: Node | null | undefined,
  segments: readonly string[],
  lineCounter: LineCounter,
  fallback: number | undefined,
): number | undefined {
  let current = node
  let line = fallback
  for (const segment of segments) {
    if (!isMap(current)) return line
    const item = current.items.find((entry) => stringKey(entry.key) === segment)
    if (!item) return line
    line = nodeLine(item.key as Node, lineCounter) ?? line
    current = item.value as Node | null | undefined
  }
  return line
}

/**
 * Top-level `x-turbopanel`: `principals` and nothing else.
 *
 * The rules and every message come from `./root-extension`, which mirrors the
 * instance module of the same name — the editor's job here is to say what the
 * save would say, before the round-trip, exactly as the per-service source
 * checks below already do. There is no `schemaVersion` to notice a new key by;
 * an unrecognized one is reported instead of ignored, with a redirect for the
 * concepts that live on the principal row or the environment instead.
 */
function lintRootTurbopanelExtension(
  valueNode: Node | null | undefined,
  keyLine: number | undefined,
  lineCounter: LineCounter,
  issues: ComposeLintIssue[],
): void {
  if (!isMap(valueNode)) return

  let plain: unknown
  try {
    plain = valueNode.toJSON()
  } catch {
    // An unresolvable alias or a cyclic anchor: nothing to say about a block
    // that cannot be read, and the YAML parser has already reported it.
    return
  }

  for (
    const issue of collectRootExtensionValidationIssues(
      TURBOPANEL_EXTENSION_KEY,
      plain,
    )
  ) {
    const segments = issue.path.split('.').slice(1)
    issues.push({
      level: 'error',
      message: issue.message,
      path: issue.path,
      line: lineForPath(valueNode, segments, lineCounter, keyLine),
    })
  }
}

function lintRootExtensionEntry(
  valueNode: Node | null | undefined,
  keyLine: number | undefined,
  lineCounter: LineCounter,
  issues: ComposeLintIssue[],
  options?: ComposeLintOptions,
): void {
  if (options?.managedExtensionHidden) {
    issues.push({
      level: 'warning',
      message: MANAGED_EXTENSION_WARNING,
      path: TURBOPANEL_EXTENSION_KEY,
      line: keyLine,
    })
    return
  }
  lintRootTurbopanelExtension(valueNode, keyLine, lineCounter, issues)
}

function lintTopLevel(
  root: YAMLMap,
  lineCounter: LineCounter,
  issues: ComposeLintIssue[],
  options?: ComposeLintOptions,
): void {
  let servicesItem: (typeof root.items)[number] | null = null
  for (const item of root.items) {
    const key = stringKey(item.key)
    if (key === null) continue
    if (key === 'services') {
      servicesItem = item
      continue
    }
    if (key === 'networks') {
      lintNetworks(item.value as Node | null | undefined, lineCounter, issues)
    }
    if (key === TURBOPANEL_EXTENSION_KEY) {
      lintRootExtensionEntry(
        item.value as Node | null | undefined,
        nodeLine(item.key as Node, lineCounter),
        lineCounter,
        issues,
        options,
      )
      continue
    }
    if (classifyTopLevelKey(key) === undefined && !isExtensionKey(key)) {
      issues.push({
        level: 'warning',
        message: unknownKeyMessage(key, 'top-level', TOP_LEVEL_FIELD_KEYS),
        path: key,
        line: nodeLine(item.key as Node, lineCounter),
      })
    }
  }

  if (!servicesItem) {
    issues.push({
      level: 'warning',
      message: 'Compose file has no "services" section',
      path: '$',
    })
    return
  }

  lintServices(
    servicesItem.value as Node | null | undefined,
    nodeLine(servicesItem.key as Node, lineCounter),
    lineCounter,
    issues,
    options,
  )
}

/** Draft-only warnings that must not block saving a blank/empty compose. */
const DRAFT_ALLOWED_LINT_MESSAGES = new Set([
  'Compose file has no "services" section',
  'No services defined',
])

/** Sort by source line (ascending); lineless last; errors before warnings on a tie. */
function compareLintIssues(a: ComposeLintIssue, b: ComposeLintIssue): number {
  const lineA = a.line ?? Number.POSITIVE_INFINITY
  const lineB = b.line ?? Number.POSITIVE_INFINITY
  if (lineA !== lineB) {
    return lineA - lineB
  }
  if (a.level !== b.level) {
    return a.level === 'error' ? -1 : 1
  }
  return a.path.localeCompare(b.path)
}

/**
 * Lint docker-compose YAML for structural mistakes (invalid YAML, unknown keys,
 * services missing image/build). Returns an empty list for empty input. Issues
 * are ordered by line number. Intended as an editor aid — it does not enforce
 * the full Compose Specification.
 *
 * Zero-arg signature mirrors instance `lintComposeYaml`. Optional `options` are
 * UI-editor-only (hidden site services + managed-extension warnings).
 */
export function lintComposeYaml(
  source: string,
  options?: ComposeLintOptions,
): ComposeLintIssue[] {
  const trimmed = source.trim()
  if (!trimmed) return []

  const lineCounter = new LineCounter()
  const doc = parseDocument(source, {
    prettyErrors: true,
    lineCounter,
    customTags: COMPOSE_CUSTOM_TAGS,
  })

  if (doc.errors.length > 0) {
    return doc.errors
      .map((error) => ({
        level: 'error' as const,
        message: error.message.split('\n')[0],
        path: '$',
        line: error.linePos?.[0]?.line,
      }))
      .sort(compareLintIssues)
  }

  const root = doc.contents
  if (!isMap(root)) {
    return [
      {
        level: 'error',
        message: 'Compose file root must be a mapping',
        path: '$',
        line: nodeLine(root as Node, lineCounter),
      },
    ]
  }

  const issues: ComposeLintIssue[] = []
  lintTopLevel(root, lineCounter, issues, options)
  if (options?.projectRepositoryId !== undefined) {
    lintSingleRepository(root, lineCounter, options.projectRepositoryId, issues)
  }
  return issues.sort(compareLintIssues)
}

/**
 * Collect every `x-turbopanel.source.sourceId` in the document, in file order.
 *
 * A second walk rather than another option threaded through the per-service
 * pass: the rule is about the document as a whole, and the service walk has no
 * place to hold what the other services said.
 */
function collectServiceSourceIds(
  root: YAMLMap,
  lineCounter: LineCounter,
): { service: string; sourceId: string; line: number | undefined }[] {
  const servicesNode = mapEntryValue(root, 'services')
  if (!isMap(servicesNode)) return []
  const found: { service: string; sourceId: string; line: number | undefined }[] = []
  for (const item of servicesNode.items) {
    const service = stringKey(item.key)
    if (service === null) continue
    const valueNode = item.value as Node | null | undefined
    if (!isMap(valueNode)) continue
    const entry = serviceSourceIdNode(valueNode as YAMLMap)
    if (!entry?.sourceId) continue
    const sourceId = entry.sourceId.trim()
    if (sourceId.length === 0) continue
    found.push({ service, sourceId, line: nodeLine(entry.node, lineCounter) })
  }
  return found
}

/**
 * One repository per project — mirrors the instance rule; keep in sync.
 *
 * Flags the *second* distinct id and everything after it, never the first: the
 * first is the project's repository (already bound, or adopted by this very
 * save), so naming it as the offender would point at the binding the operator
 * actually wants.
 */
function lintSingleRepository(
  root: YAMLMap,
  lineCounter: LineCounter,
  projectRepositoryId: string | null,
  issues: ComposeLintIssue[],
): void {
  const bound = projectRepositoryId?.trim() || null
  let adopted = bound
  for (const entry of collectServiceSourceIds(root, lineCounter)) {
    if (adopted === null) {
      adopted = entry.sourceId
      continue
    }
    if (entry.sourceId === adopted) continue
    issues.push({
      level: 'error',
      message: bound === null
        ? 'a project builds from one repository — every service that names a source must name the same one'
        : `source '${entry.sourceId}' is not this project's repository — a project builds from one repository`,
      path: `services.${entry.service}.x-turbopanel.source.sourceId`,
      line: entry.line,
    })
  }
}

/**
 * Issues that must fail a save (everything except empty-draft warnings).
 * Mirrors instance `blockingComposeLintIssues` — keep in sync.
 */
export function blockingComposeLintIssues(
  issues: readonly ComposeLintIssue[],
): ComposeLintIssue[] {
  return issues.filter(
    (issue) =>
      issue.blocking !== false && !DRAFT_ALLOWED_LINT_MESSAGES.has(issue.message),
  )
}
