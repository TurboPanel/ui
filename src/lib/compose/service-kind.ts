/** Per-service `x-turbopanel` extension (Compose `services.<name>.x-turbopanel`). */

export const TURBOPANEL_SERVICE_EXTENSION_KEY = 'x-turbopanel'

export type ComposeServiceKind = 'container' | 'traditional-web' | 'node'

export type TraditionalWebEngine = 'apache' | 'nginx' | 'openlitespeed'

/**
 * Runtime family for a `serviceKind: node` service. Mirrors the instance type.
 * `auto` (the default) leaves detection to the daemon build — a Next.js tree
 * that emitted `.next/standalone` is served as `next`, anything else as `node`.
 */
export type NativeRuntimeFramework = 'auto' | 'node' | 'next'

/**
 * Build backend for a `x-turbopanel.source` binding. Mirrors the instance type.
 *
 * `native` (the default when omitted) is the checkout → build → promote
 * directory release. `railpack` swaps that middle step for Railpack + BuildKit,
 * which emits an OCI image the daemon tags and feeds back into runtime compose
 * as `services.<name>.image`.
 */
export type ComposeSourceBuildKind = 'native' | 'railpack'

/** Max length for operator-facing service description metadata. */
export const SERVICE_DESCRIPTION_MAX_LENGTH = 500

/** Max length for a Git ref name pinned on a service source. */
export const SOURCE_BRANCH_MAX_LENGTH = 255
/** Max length for the build / start command overrides. */
export const SOURCE_COMMAND_MAX_LENGTH = 1000

/** `24`, `24.17`, or `24.17.0` — a pinned major/minor/patch, never a range. */
const NODE_VERSION_RE = /^\d{1,3}(\.\d{1,3}){0,2}$/

/**
 * Per-service Git source binding (`x-turbopanel.source`).
 *
 * Mirrors the instance type in `turbopanel/src/lib/compose/service-kind.ts`.
 * `sourceId` shape is all this module can check — whether the id resolves is
 * decided by the instance route layer (and, once the UI has a sources list, by
 * passing `knownSourceIds` into `lintComposeYaml`).
 */
export type ComposeServiceSourceExtension = {
  sourceId: string
  /** Git ref to build; falls back to `source.defaultBranch` when omitted. */
  branch?: string
  /** Relative checkout subdirectory. */
  subdirectory?: string
  buildCommand?: string
  startCommand?: string
  /** Relative build-output directory. */
  outputDirectory?: string
  /**
   * Which build backend produces the release. Omitted means `native`.
   *
   * `railpack` is only meaningful on a container service — `traditional-web`
   * and `node` already have their own build and runtime lanes — and the
   * instance rejects the combination on save.
   */
  buildKind?: ComposeSourceBuildKind
}

/** Injection point for callers that can resolve source ids. */
export type SourceIdResolver = (sourceId: string) => boolean

export type ComposeServiceTurbopanelExtension = {
  serviceKind?: ComposeServiceKind
  engine?: TraditionalWebEngine
  /** Native runtime family for `serviceKind: node`. Omitted means `auto`. */
  framework?: NativeRuntimeFramework
  /** Pinned Node series for `serviceKind: node` (`24`, `24.17`, `24.17.0`). */
  nodeVersion?: string
  /**
   * Document-root segment under the daemon site directory (relative only).
   * Default `public` when omitted for traditional-web.
   */
  root?: string
  /**
   * Optional human description (TurboPanel-only metadata; not used by Docker).
   */
  description?: string
  /**
   * Optional Git source binding. Deploy prep resolves this into payload
   * `sourceMaterial[]` and the daemon builds and promotes a release from it.
   * It does **not** yet decide document roots or process supervision.
   */
  source?: ComposeServiceSourceExtension
}

const SERVICE_KINDS = new Set<ComposeServiceKind>(['container', 'traditional-web', 'node'])
const NATIVE_RUNTIME_FRAMEWORKS = new Set<NativeRuntimeFramework>(['auto', 'node', 'next'])
const TRADITIONAL_WEB_ENGINES = new Set<TraditionalWebEngine>(['apache', 'nginx', 'openlitespeed'])
const SOURCE_BUILD_KINDS = new Set<ComposeSourceBuildKind>(['native', 'railpack'])

function isPlainMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readServiceKind(value: unknown): ComposeServiceKind | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!SERVICE_KINDS.has(trimmed as ComposeServiceKind)) return undefined
  return trimmed as ComposeServiceKind
}

function readTraditionalWebEngine(value: unknown): TraditionalWebEngine | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!TRADITIONAL_WEB_ENGINES.has(trimmed as TraditionalWebEngine)) return undefined
  return trimmed as TraditionalWebEngine
}

function readNativeRuntimeFramework(value: unknown): NativeRuntimeFramework | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!NATIVE_RUNTIME_FRAMEWORKS.has(trimmed as NativeRuntimeFramework)) {
    return undefined
  }
  return trimmed as NativeRuntimeFramework
}

function readSourceBuildKind(value: unknown): ComposeSourceBuildKind | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!SOURCE_BUILD_KINDS.has(trimmed as ComposeSourceBuildKind)) {
    return undefined
  }
  return trimmed as ComposeSourceBuildKind
}

function readNodeVersion(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return NODE_VERSION_RE.test(trimmed) ? trimmed : undefined
}

const SOURCE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SOURCE_STRING_FIELDS = [
  'branch',
  'subdirectory',
  'buildCommand',
  'startCommand',
  'outputDirectory',
] as const

type SourceStringField = (typeof SOURCE_STRING_FIELDS)[number]

function sourceFieldMaxLength(field: SourceStringField): number {
  if (field === 'branch') return SOURCE_BRANCH_MAX_LENGTH
  if (field === 'buildCommand' || field === 'startCommand') {
    return SOURCE_COMMAND_MAX_LENGTH
  }
  return 200
}

function readSourceId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return SOURCE_UUID_RE.test(trimmed) ? trimmed : undefined
}

/** Mirror of the instance parser — drops the block when `sourceId` is unusable. */
export function parseServiceSourceExtension(value: unknown): ComposeServiceSourceExtension | null {
  if (!isPlainMapping(value)) return null

  const sourceId = readSourceId(value.sourceId)
  if (!sourceId) return null

  const source: ComposeServiceSourceExtension = { sourceId }
  for (const field of SOURCE_STRING_FIELDS) {
    const raw = value[field]
    if (typeof raw !== 'string') continue
    const trimmed = raw.trim()
    if (trimmed.length === 0 || trimmed.length > sourceFieldMaxLength(field)) {
      continue
    }
    source[field] = trimmed
  }

  const buildKind = readSourceBuildKind(value.buildKind)
  if (buildKind) source.buildKind = buildKind

  return source
}

/** Read the parsed source binding off a raw compose service, if any. */
export function readServiceSourceExtension(
  service: Record<string, unknown>
): ComposeServiceSourceExtension | undefined {
  const extension = readServiceTurbopanelExtension(service)
  return extension?.source
}

/** Trimmed string, or `undefined` when absent, blank, or past `maxLength`. */
function readBoundedString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > maxLength) return undefined
  return trimmed
}

/** Drop the keys whose reader found nothing, so the block collapses when unused. */
function withoutEmptyFields<T extends object>(candidate: T): T {
  return Object.fromEntries(
    Object.entries(candidate).filter(([, field]) => Boolean(field))
  ) as T
}

export function parseServiceTurbopanelExtension(
  value: unknown
): ComposeServiceTurbopanelExtension | null {
  if (value === null || value === undefined) return {}
  if (!isPlainMapping(value)) return null

  // `parseServiceSourceExtension` already refuses a non-mapping, `null`
  // included, so the source key needs no guard of its own.
  return withoutEmptyFields<ComposeServiceTurbopanelExtension>({
    serviceKind: readServiceKind(value.serviceKind),
    engine: readTraditionalWebEngine(value.engine),
    framework: readNativeRuntimeFramework(value.framework),
    nodeVersion: readNodeVersion(value.nodeVersion),
    root: readBoundedString(value.root, Number.POSITIVE_INFINITY),
    description: readBoundedString(value.description, SERVICE_DESCRIPTION_MAX_LENGTH),
    source: parseServiceSourceExtension(value.source) ?? undefined,
  })
}

export function readServiceTurbopanelExtension(
  service: Record<string, unknown>
): ComposeServiceTurbopanelExtension | null {
  if (!(TURBOPANEL_SERVICE_EXTENSION_KEY in service)) return {}
  return parseServiceTurbopanelExtension(service[TURBOPANEL_SERVICE_EXTENSION_KEY])
}

export function isTraditionalWebComposeService(service: Record<string, unknown>): boolean {
  const extension = readServiceTurbopanelExtension(service)
  if (extension === null) return false
  return extension.serviceKind === 'traditional-web'
}

/** True for `serviceKind: node` — a host-supervised Git-backed process. */
export function isNodeComposeService(service: Record<string, unknown>): boolean {
  const extension = readServiceTurbopanelExtension(service)
  if (extension === null) return false
  return extension.serviceKind === 'node'
}

/** Kinds that are not Docker services and therefore need no `image`/`build`. */
export function isHostNativeServiceKind(kind: ComposeServiceKind | undefined): boolean {
  return kind === 'traditional-web' || kind === 'node'
}

/**
 * Patch shape for {@link patchServiceTurbopanelExtension}.
 *
 * Identical to the extension itself except that `source` also accepts `null`,
 * which *clears* the binding — omitting the key keeps whatever is there, so
 * without a distinct "no source" value a caller could add a binding but never
 * remove one.
 */
export type ComposeServiceTurbopanelExtensionPatch = Omit<
  ComposeServiceTurbopanelExtension,
  'source'
> & { source?: ComposeServiceSourceExtension | null }

/**
 * Clear the fields that belong to a `serviceKind` other than the one now set.
 *
 * `railpack` goes with them: it is a container-only build backend —
 * `traditional-web` and `node` have their own build and runtime lanes, and the
 * instance rejects the combination on save. The Services form stops *offering*
 * the option once the kind moves off container, which is not the same as
 * clearing it: without this a service that was switched away from container
 * keeps an invisible `buildKind: 'railpack'` until the compose document is
 * rejected on save. Drop the field entirely rather than rewriting it to
 * `native`, which is what omitting it already means.
 */
function dropFieldsForOtherKinds(
  next: ComposeServiceTurbopanelExtensionPatch
): void {
  if (next.serviceKind !== 'traditional-web') {
    delete next.engine
    delete next.root
  }
  if (next.serviceKind !== 'node') {
    delete next.framework
    delete next.nodeVersion
  }
  if (isHostNativeServiceKind(next.serviceKind) && next.source) {
    const { buildKind: _railpackNotApplicable, ...source } = next.source
    next.source = source
  }
}

/**
 * Empty string clears description so the extension can collapse when unused.
 * Cap length so we never persist a value parseServiceTurbopanelExtension drops.
 */
function normalizeDescription(
  next: ComposeServiceTurbopanelExtensionPatch
): void {
  if (typeof next.description !== 'string') return
  const description = next.description.trim()
  if (description.length === 0) {
    delete next.description
    return
  }
  next.description = description.slice(0, SERVICE_DESCRIPTION_MAX_LENGTH)
}

export function patchServiceTurbopanelExtension(
  service: Record<string, unknown>,
  patch: ComposeServiceTurbopanelExtensionPatch
): Record<string, unknown> {
  const current = readServiceTurbopanelExtension(service) ?? {}
  const next: ComposeServiceTurbopanelExtensionPatch = { ...current, ...patch }

  dropFieldsForOtherKinds(next)
  normalizeDescription(next)

  // `source: null` in a patch clears the binding; omitting it keeps it.
  if (!next.source) delete next.source

  const cleaned: Record<string, unknown> = {}
  if (next.serviceKind) cleaned.serviceKind = next.serviceKind
  if (next.engine) cleaned.engine = next.engine
  if (next.root) cleaned.root = next.root
  if (next.framework) cleaned.framework = next.framework
  if (next.nodeVersion) cleaned.nodeVersion = next.nodeVersion
  if (next.description) cleaned.description = next.description
  if (next.source) cleaned.source = { ...next.source }

  if (Object.keys(cleaned).length === 0) {
    const { [TURBOPANEL_SERVICE_EXTENSION_KEY]: _removed, ...rest } = service
    return rest
  }

  return {
    ...service,
    [TURBOPANEL_SERVICE_EXTENSION_KEY]: cleaned,
  }
}

export const TRADITIONAL_WEB_ENGINE_OPTIONS: readonly {
  value: TraditionalWebEngine
  label: string
  deployable: boolean
}[] = [
  { value: 'nginx', label: 'nginx (static / reverse proxy)', deployable: true },
  { value: 'apache', label: 'Apache (mod_php)', deployable: true },
  {
    value: 'openlitespeed',
    label: 'OpenLiteSpeed (static)',
    deployable: true,
  },
]
