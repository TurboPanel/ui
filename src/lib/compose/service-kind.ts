/** Per-service `x-turbopanel` extension (Compose `services.<name>.x-turbopanel`). */

import {
  type ComposeHostingExtensionEntry,
  parseHostingExtensionEntries,
} from './hosting-extension'

export const TURBOPANEL_SERVICE_EXTENSION_KEY = 'x-turbopanel'

export type ComposeServiceKind = 'container' | 'site' | 'node'

export type SiteEngine = 'caddy' | 'apache' | 'nginx' | 'openlitespeed'

/**
 * Runtime family for a `serviceKind: node` service. Mirrors the instance type.
 * `auto` (the default) leaves detection to the daemon build — a Next.js tree
 * that emitted `.next/standalone` is served as `next`, anything else as `node`.
 */
export type NativeRuntimeFramework = 'auto' | 'node' | 'next'

/**
 * Package manager used to install a `serviceKind: node` build. Mirrors the
 * instance type. Omitted means auto-detect from the lockfile at build time.
 */
export type NodePackageManager = 'npm' | 'yarn' | 'pnpm'

/**
 * `NODE_ENV` for a `serviceKind: node` service (build + unit). Mirrors the
 * instance type. Omitted means `production`.
 */
export type NodeAppMode = 'production' | 'development'

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
/**
 * Document-local principal alias charset. Mirrors the instance constant.
 *
 * Canonical home here even though the root block is what *declares* an alias:
 * `x-turbopanel.principal` on a service **references** one, and
 * `./root-extension` already imports this module, so putting the regex there
 * and importing it back is the direction that would close a cycle.
 */
export const PRINCIPAL_ALIAS_RE = /^[a-z][a-z0-9_-]{0,63}$/i

export function isPrincipalAlias(value: unknown): value is string {
  return typeof value === 'string' && PRINCIPAL_ALIAS_RE.test(value.trim())
}

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
 * decided by the instance route layer (and, once the UI has a repositories
 * list, by passing `knownSourceIds` into `lintComposeYaml`). The compose
 * document key is intentionally still `x-turbopanel.source`.
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
   * `railpack` is only meaningful on a container service — `site`
   * and `node` already have their own build and runtime lanes — and the
   * instance rejects the combination on save.
   */
  buildKind?: ComposeSourceBuildKind
}

/** Injection point for callers that can resolve source ids. */
export type SourceIdResolver = (sourceId: string) => boolean

/**
 * Every `x-turbopanel` service field, all optional — the flat, pre-narrowing
 * view the parser fills in and the patch helper edits. Mirrors the instance's
 * `ComposeServiceExtensionFields`.
 *
 * The **exported** type is the discriminated union below. This one exists
 * because the *wire* shape has always been one flat mapping per service and
 * always will be: narrowing by `serviceKind` is a compile-time story about
 * which keys are legal, not a change to what is written or parsed.
 */
export type ComposeServiceExtensionFields = {
  serviceKind?: ComposeServiceKind
  engine?: SiteEngine
  /** Native runtime family for `serviceKind: node`. Omitted means `auto`. */
  framework?: NativeRuntimeFramework
  /** Pinned Node series for `serviceKind: node` (`24`, `24.17`, `24.17.0`). */
  nodeVersion?: string
  /**
   * Package manager for a `serviceKind: node` build. Omitted means
   * auto-detect from the lockfile at build time.
   */
  packageManager?: NodePackageManager
  /** `NODE_ENV` for a `serviceKind: node` service. Omitted means `production`. */
  appMode?: NodeAppMode
  /**
   * Whether a `serviceKind: node` process should run. Omitted means `true`.
   * When `false` the release still builds; the daemon stops and disables the
   * unit instead of starting it.
   */
  enabled?: boolean
  /**
   * Document root for a `serviceKind: node` service (relative only).
   * Informational this pass: recorded and shown, not yet served.
   */
  documentRoot?: string
  /**
   * Script the vendored Node runs when `source.startCommand` is absent.
   * Omitted means `server.js`; an explicit `startCommand` always wins.
   */
  startupFile?: string
  /**
   * Document-root segment under the daemon site directory (relative only).
   * Default `public` when omitted for site.
   */
  root?: string
  /**
   * Where a `site` service's content comes from. Omitted means `release`.
   *
   * `release` is a Git-backed immutable tree the daemon publishes and only ever
   * asserts. `managed-directory` is a principal-writable `webroot/` the tenant
   * fills over SFTP — "a directory and a principal", which is what a WordPress
   * or plain-PHP site actually wants.
   *
   * An explicit field rather than an inference from whether `source` is set,
   * because the two differ in a property worth stating out loud: a managed
   * directory gives up the immutable-release guarantee, so the tree the engine
   * executes is writable by the account running it. That is the right trade for
   * an application that writes to itself by design and the wrong one for a
   * built application.
   */
  sourceKind?: SiteSourceKind
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
  /**
   * PHP configuration for a `site` service. Mirrors the instance type.
   *
   * Lives on the service, not the hosting row: an FPM pool is keyed by
   * (environment, compose service), so several hostings on one service used to
   * silently last-wins merge into one pool.
   */
  php?: ComposeServicePhpExtension
  /**
   * Scheduled jobs for a `site` or `node` service.
   *
   * Rendered by the daemon as a systemd timer per entry, with `User=` set to
   * the service's principal. That is what makes this the cleanest proof
   * entitlement had to be an OS grant: `ExecStart` reaches `execve` **after**
   * systemd has dropped privileges, so `/usr/bin/php8.4` succeeds or fails
   * purely on the account's group membership. Nothing in the generated unit
   * grants anything.
   */
  cron?: ComposeServiceCronJob[]
  /**
   * The account this host-native service runs as, named by **alias**.
   *
   * The value is a key in the sibling root `x-turbopanel.principals` map — a
   * document-local name — never a Linux username. What the account *is* on the
   * host (uid, gid, home, shell) is decided instance-side on the `principal`
   * row, which is why an alias can be written by anyone with compose edit
   * rights while none of those can.
   *
   * Legal on `site` and `node`, refused on `container`: a container has no
   * account to run as. **Optional** on both host-native kinds, mirroring the
   * instance — a document written before this field existed names no alias and
   * is owned by whatever principal an operator assigned in the panel. Naming
   * one is still the better answer: it wins outright over the sole-steward
   * lookup. Whether a service has an owner at all is answered by
   * `./principal-required.ts`, which can see the environment's principals.
   */
  principal?: string
  /**
   * Ingress routes this service answers on (`x-turbopanel.hosting`). Mirrors
   * the instance field.
   *
   * Legal on every kind, because every kind can front one: a container behind
   * the edge, a site served by a host engine, a supervised `node` process. The
   * block is **never** a `ports:` replacement — it opens no host port, it
   * declares a hostname the edge routes by name. See `./hosting-extension`,
   * which owns the shape, the messages, and the redirects that say so.
   *
   * The instance's deploy-prepare materializes each entry into a `hosting` row;
   * the hosting panel reads those rows, so an entry declared here shows up
   * there as compose-owned and read-only.
   */
  hosting?: ComposeHostingExtensionEntry[]
}

/**
 * Fields any kind may carry: what the service is, where its code comes from,
 * and which hostnames reach it.
 */
type CommonServiceExtensionFields = Pick<
  ComposeServiceExtensionFields,
  'serviceKind' | 'description' | 'source' | 'hosting'
>

/** Site-only fields: how the content is served, and what serves it. */
type SiteOnlyExtensionField = 'engine' | 'root' | 'sourceKind' | 'php'

/** Node-only fields: how the process is built, pinned, and supervised. */
type NodeOnlyExtensionField =
  | 'framework'
  | 'nodeVersion'
  | 'packageManager'
  | 'appMode'
  | 'enabled'
  | 'documentRoot'
  | 'startupFile'

/**
 * Fields both host-native kinds carry. A container has no principal to run as
 * and no tree to run in; `site` and `node` have exactly one of each.
 */
type HostNativeExtensionField = 'cron' | 'principal'

/**
 * Spell a field that belongs to a *different* kind, so authoring it is a type
 * error rather than a silently ignored key. Optional-`never` rather than an
 * omission on purpose: it keeps the key present on every union member, which is
 * what lets a caller holding the union still read `extension.engine` and get
 * `SiteEngine | undefined` instead of a property-does-not-exist error.
 */
type NotForThisKind<Field extends keyof ComposeServiceExtensionFields> = {
  [Key in Field]?: never
}

/** The default kind. Runs from an image; everything host-native is off-limits. */
export type ComposeContainerServiceExtension = CommonServiceExtensionFields & {
  serviceKind?: 'container'
} & NotForThisKind<
    SiteOnlyExtensionField | NodeOnlyExtensionField | HostNativeExtensionField
  >

/** Served by a host engine out of a document root. */
export type ComposeSiteServiceExtension = CommonServiceExtensionFields & {
  serviceKind: 'site'
} & Pick<
    ComposeServiceExtensionFields,
    SiteOnlyExtensionField | HostNativeExtensionField
  > &
  NotForThisKind<NodeOnlyExtensionField>

/**
 * A supervised host process built from Git. `source` is **required**, not
 * optional: without one there is nothing to check out, build, or supervise, so
 * a node service without a source is not a node service with a missing hint.
 */
export type ComposeNodeServiceExtension = Omit<
  CommonServiceExtensionFields,
  'serviceKind' | 'source'
> & { serviceKind: 'node'; source: ComposeServiceSourceExtension } & Pick<
    ComposeServiceExtensionFields,
    NodeOnlyExtensionField | HostNativeExtensionField
  > &
  NotForThisKind<SiteOnlyExtensionField>

/**
 * The per-service `x-turbopanel` block, narrowed by `serviceKind`. Mirrors the
 * instance union so lint messages and form legality agree.
 *
 * The JSON on the wire is unchanged — still one flat mapping per service. What
 * the union adds is that the type now *says* which fields belong to which kind,
 * instead of being an all-optional bag whose real rules lived only in the
 * instance's validators.
 */
export type ComposeServiceTurbopanelExtension =
  | ComposeContainerServiceExtension
  | ComposeSiteServiceExtension
  | ComposeNodeServiceExtension

/**
 * The one table of "which fields may a service of this kind carry". Mirrors the
 * instance's `SERVICE_EXTENSION_FIELDS`.
 *
 * Both the union above and the Services form's field-clearing are statements of
 * this table. They used to be written twice — an all-optional type that said
 * nothing about legality, plus a hand-listed `delete` per kind — which is the
 * arrangement that lets the editor keep an invisible field the instance then
 * rejects on save.
 */
type ServiceExtensionFieldRule = {
  /** Kinds the field may be authored on. */
  readonly kinds: readonly ComposeServiceKind[]
  /** Message the instance emits when the field is authored on another kind. */
  readonly typeMessage?: string
}

const ALL_SERVICE_KINDS: readonly ComposeServiceKind[] = [
  'container',
  'site',
  'node',
]
const SITE_KIND_ONLY: readonly ComposeServiceKind[] = ['site']
const NODE_KIND_ONLY: readonly ComposeServiceKind[] = ['node']
/** Both host-native kinds — the set {@link isHostNativeServiceKind} names. */
const HOST_NATIVE_KINDS: readonly ComposeServiceKind[] = ['site', 'node']

const SERVICE_EXTENSION_FIELDS: Readonly<
  Record<string, ServiceExtensionFieldRule>
> = {
  serviceKind: {
    kinds: ALL_SERVICE_KINDS,
    typeMessage: 'serviceKind must be "container", "site", or "node"',
  },
  description: { kinds: ALL_SERVICE_KINDS },
  // No kind restriction on *having* a source: a source builds a release for any
  // kind. `buildKind: railpack` is the one combination that contradicts a
  // host-native kind, and the instance's `validateSourceConsistency` owns it.
  source: { kinds: ALL_SERVICE_KINDS },
  // Legal on every kind: a container behind the edge, a site served by a host
  // engine, and a supervised `node` process can each answer on a hostname. The
  // per-kind rules that *do* exist (`targetPort` is a container question) live
  // in `./hosting-extension`, next to the rest of the block's shape.
  hosting: { kinds: ALL_SERVICE_KINDS },
  engine: {
    kinds: SITE_KIND_ONLY,
    typeMessage: 'engine must be "caddy", "apache", "nginx", or "openlitespeed"',
  },
  root: { kinds: SITE_KIND_ONLY },
  sourceKind: { kinds: SITE_KIND_ONLY },
  php: { kinds: SITE_KIND_ONLY },
  cron: { kinds: HOST_NATIVE_KINDS },
  principal: {
    kinds: HOST_NATIVE_KINDS,
    typeMessage:
      'principal must name an alias declared in x-turbopanel.principals (a letter, then letters, digits, "-", and "_"; at most 64 characters)',
  },
  framework: {
    kinds: NODE_KIND_ONLY,
    typeMessage: 'framework must be "auto", "node", or "next"',
  },
  nodeVersion: {
    kinds: NODE_KIND_ONLY,
    typeMessage: 'nodeVersion must be a pinned version like "24" or "24.17.0"',
  },
  packageManager: {
    kinds: NODE_KIND_ONLY,
    typeMessage: 'packageManager must be "npm", "yarn", or "pnpm"',
  },
  appMode: {
    kinds: NODE_KIND_ONLY,
    typeMessage: 'appMode must be "production" or "development"',
  },
  enabled: {
    kinds: NODE_KIND_ONLY,
    typeMessage: 'enabled must be true or false',
  },
  documentRoot: { kinds: NODE_KIND_ONLY },
  startupFile: { kinds: NODE_KIND_ONLY },
}

/**
 * Fields a kind must carry to be that kind at all. Only `node` has one, for the
 * reason its union member states: no repository, nothing to build or run.
 *
 * `principal` is deliberately absent on both host-native kinds, mirroring the
 * instance table. The alias is the newer of the two ways a `site` / `node`
 * service names its account; a document authored before
 * `x-turbopanel.principals` existed names none and is owned by whatever
 * principal an operator assigned in the panel. Requiring it here would make
 * the editor refuse those documents and hide the sole-steward fallback deploy
 * still implements. Ownership is answered instead by
 * `./principal-required.ts` and `./managed-directory-sites.ts`, which can see
 * the environment's principals; what stays a document question — `principal`
 * refused on `container`, alias shape, and alias resolution against the root
 * `principals` map — is still checked here and in `./lint.ts`.
 */
const SERVICE_KIND_REQUIRED_FIELDS: Readonly<
  Record<ComposeServiceKind, readonly string[]>
> = {
  container: [],
  site: [],
  node: ['source'],
}

export type ServiceKindFieldRules = {
  readonly allowedFields: ReadonlySet<string>
  readonly requiredFields: ReadonlySet<string>
}

function buildServiceKindFieldTable(): Readonly<
  Record<ComposeServiceKind, ServiceKindFieldRules>
> {
  const table = {} as Record<ComposeServiceKind, ServiceKindFieldRules>
  for (const kind of ALL_SERVICE_KINDS) {
    const allowedFields = new Set<string>()
    for (const [field, rule] of Object.entries(SERVICE_EXTENSION_FIELDS)) {
      if (rule.kinds.includes(kind)) allowedFields.add(field)
    }
    table[kind] = {
      allowedFields,
      requiredFields: new Set(SERVICE_KIND_REQUIRED_FIELDS[kind]),
    }
  }
  return table
}

/**
 * Per-kind view of {@link SERVICE_EXTENSION_FIELDS}, derived rather than
 * written twice. Mirrors the instance export of the same name.
 */
export const SERVICE_KIND_FIELD_TABLE: Readonly<
  Record<ComposeServiceKind, ServiceKindFieldRules>
> = buildServiceKindFieldTable()

/** `site` / `site or node` / `container, site, or node`, as a message reads. */
function describeKinds(kinds: readonly ComposeServiceKind[]): string {
  if (kinds.length === 1) return kinds[0]
  if (kinds.length === 2) return `${kinds[0]} or ${kinds[1]}`
  return `${kinds.slice(0, -1).join(', ')}, or ${kinds.at(-1)}`
}

/**
 * The instance's message for authoring `field` on `kind`, or `null` when it
 * belongs. Derived from the table so the two can never disagree.
 */
export function serviceKindFieldMessage(
  field: string,
  kind: ComposeServiceKind | undefined
): string | null {
  const rule = SERVICE_EXTENSION_FIELDS[field]
  if (!rule) return null
  // An omitted `serviceKind` means `container`, the same default the parser and
  // the daemon read it as.
  if (rule.kinds.includes(kind ?? 'container')) return null
  return `${field} is only valid when serviceKind is ${describeKinds(rule.kinds)}`
}

/** One per-kind legality problem with an authored per-service `x-turbopanel`. */
export type ServiceKindFieldIssue = {
  /** Extension field the message is about (`engine`, `source`, …). */
  field: string
  message: string
}

/**
 * Field-membership and required-field diagnostics for one authored per-service
 * `x-turbopanel` mapping — the UI half of the instance's
 * `collectServiceTurbopanelValidationIssues`.
 *
 * Both halves read {@link SERVICE_KIND_FIELD_TABLE}, so the linter says what
 * the save would say instead of letting the editor bless a document the
 * control plane then rejects. Asked of the raw mapping rather than the parsed
 * extension: `php: {}` on a container parses to nothing but is still an
 * authored php block, and saying so beats silence. A key present with no value
 * (`root:`) is the one exception — that is a half-typed line, not a claim.
 */
export function collectServiceKindFieldIssues(
  extension: Record<string, unknown>
): ServiceKindFieldIssue[] {
  const kind = readServiceKind(extension.serviceKind)
  const issues: ServiceKindFieldIssue[] = []

  for (const [field, value] of Object.entries(extension)) {
    if (value === null || value === undefined) continue
    const message = serviceKindFieldMessage(field, kind)
    if (message) issues.push({ field, message })
  }

  // Required fields are a statement about a kind, so an omitted `serviceKind`
  // has nothing to require: it means `container`, which requires nothing.
  if (kind === undefined) return issues
  for (const field of SERVICE_KIND_FIELD_TABLE[kind].requiredFields) {
    const value = extension[field]
    if (value !== null && value !== undefined) continue
    issues.push({ field, message: `${kind} services require ${field}` })
  }

  return issues
}

/**
 * One scheduled job.
 *
 * `schedule` is a 5-field cron expression (or a `@daily`-style shorthand) as the
 * operator authored it — cron is what operators know, and `OnCalendar` is not
 * something to make anyone learn. It is translated once, control-plane side, by
 * `lib/cron.ts`; see that module for the day-of-month / day-of-week rule it
 * refuses rather than approximates.
 *
 * `command` is argv, not a shell line. systemd runs it directly, so `>>`, `|`,
 * and globs are inert text rather than syntax — the linter rejects them instead
 * of letting a line that looks like it redirects output silently pass `>>` to
 * the script as an argument. Output goes to the log viewer through journald,
 * which is where it was wanted anyway.
 */
export type ComposeServiceCronJob = {
  /** Unit-name segment: lowercase, `[a-z0-9-]`, unique within the service. */
  name: string
  /** Cron expression as authored. */
  schedule: string
  /** Command line, split to argv at deploy. */
  command: string
}

export type ComposeServicePhpExtension = {
  /** Series (`8.4`). Omitted means the host default. */
  version?: string
  /** Opt-in extensions on top of the always-installed baseline. */
  extensions?: string[]
  /** `php_admin_value` directives, validated by the instance settings table. */
  settings?: Record<string, string | number>
  /** php-fpm pool tuning (`pm`, `pm.max_children`, …). */
  pool?: Record<string, string | number>
}

const SERVICE_KINDS = new Set<ComposeServiceKind>(['container', 'site', 'node'])
const NATIVE_RUNTIME_FRAMEWORKS = new Set<NativeRuntimeFramework>(['auto', 'node', 'next'])
const SITE_ENGINES = new Set<SiteEngine>([
  'caddy',
  'apache',
  'nginx',
  'openlitespeed',
])
const SOURCE_BUILD_KINDS = new Set<ComposeSourceBuildKind>(['native', 'railpack'])
const NODE_PACKAGE_MANAGERS = new Set<NodePackageManager>(['npm', 'yarn', 'pnpm'])
const NODE_APP_MODES = new Set<NodeAppMode>(['production', 'development'])

/** Where a site's content comes from. Omitted means `release`. */
export type SiteSourceKind = 'release' | 'managed-directory'

export const SITE_SOURCE_KINDS = new Set<SiteSourceKind>([
  'release',
  'managed-directory',
])

/**
 * Shape-only read; the instance's `lib/cron.ts` is what validates the schedule
 * and the command, and its linter is what tells the operator why one was
 * refused.
 */
function parseServiceCronJobs(value: unknown): ComposeServiceCronJob[] | null {
  if (!Array.isArray(value)) return null
  const jobs: ComposeServiceCronJob[] = []
  for (const raw of value) {
    if (!isPlainMapping(raw)) continue
    const name = readBoundedString(raw.name, 64)
    const schedule = readBoundedString(raw.schedule, 200)
    const command = readBoundedString(raw.command, 1000)
    if (!name || !schedule || !command) continue
    jobs.push({ name, schedule, command })
  }
  return jobs.length > 0 ? jobs : null
}

function readSiteSourceKind(value: unknown): SiteSourceKind | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!SITE_SOURCE_KINDS.has(trimmed as SiteSourceKind)) return undefined
  return trimmed as SiteSourceKind
}

function isPlainMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readServiceKind(value: unknown): ComposeServiceKind | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!SERVICE_KINDS.has(trimmed as ComposeServiceKind)) return undefined
  return trimmed as ComposeServiceKind
}

function readSiteEngine(value: unknown): SiteEngine | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!SITE_ENGINES.has(trimmed as SiteEngine)) return undefined
  return trimmed as SiteEngine
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

function readNodePackageManager(value: unknown): NodePackageManager | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!NODE_PACKAGE_MANAGERS.has(trimmed as NodePackageManager)) return undefined
  return trimmed as NodePackageManager
}

function readNodeAppMode(value: unknown): NodeAppMode | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!NODE_APP_MODES.has(trimmed as NodeAppMode)) return undefined
  return trimmed as NodeAppMode
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
  const extension = withoutEmptyFields<ComposeServiceExtensionFields>({
    serviceKind: readServiceKind(value.serviceKind),
    engine: readSiteEngine(value.engine),
    framework: readNativeRuntimeFramework(value.framework),
    nodeVersion: readNodeVersion(value.nodeVersion),
    packageManager: readNodePackageManager(value.packageManager),
    appMode: readNodeAppMode(value.appMode),
    documentRoot: readBoundedString(value.documentRoot, 200),
    startupFile: readBoundedString(value.startupFile, 200),
    root: readBoundedString(value.root, Number.POSITIVE_INFINITY),
    sourceKind: readSiteSourceKind(value.sourceKind),
    cron: parseServiceCronJobs(value.cron) ?? undefined,
    // Shape-only, like every other reader here. Whether the alias *resolves* is
    // a question about the document as a whole, so the linter answers it
    // (`knownPrincipalAliases`).
    principal: isPrincipalAlias(value.principal)
      ? value.principal.trim()
      : undefined,
    description: readBoundedString(value.description, SERVICE_DESCRIPTION_MAX_LENGTH),
    source: parseServiceSourceExtension(value.source) ?? undefined,
    php: parseServicePhpExtension(value.php) ?? undefined,
    hosting: parseHostingExtensionEntries(value.hosting),
  })
  // Outside the falsy-dropping helper on purpose: `enabled: false` is a real
  // value and must survive the round-trip.
  if (typeof value.enabled === 'boolean') extension.enabled = value.enabled
  // Narrowed by assertion, not by re-checking. The union records which keys
  // each kind may carry; whether *this* document respected that is the
  // linter's question, and it answers with a message rather than a silent drop.
  return extension as ComposeServiceTurbopanelExtension
}

function parsePhpExtensionNames(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const names = value
    .filter((name): name is string => typeof name === 'string')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name.length > 0)
  if (names.length === 0) return undefined
  return [...new Set(names)].sort((a, b) => a.localeCompare(b))
}

function parsePhpStringNumberMap(
  value: unknown,
): Record<string, string | number> | undefined {
  if (!isPlainMapping(value)) return undefined
  const kept: Record<string, string | number> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string' || typeof entry === 'number') {
      kept[key] = entry
    }
  }
  return Object.keys(kept).length > 0 ? kept : undefined
}

/**
 * Shape-only read; the instance's `php-settings.ts` table is what validates
 * values, and its linter is what tells the operator why one was refused.
 */
function parseServicePhpExtension(
  value: unknown
): ComposeServicePhpExtension | null {
  if (!isPlainMapping(value)) return null
  const php: ComposeServicePhpExtension = {}
  const version = readBoundedString(value.version, 16)
  if (version) php.version = version
  const extensions = parsePhpExtensionNames(value.extensions)
  if (extensions) php.extensions = extensions
  for (const field of ['settings', 'pool'] as const) {
    const mapped = parsePhpStringNumberMap(value[field])
    if (mapped) php[field] = mapped
  }
  return Object.keys(php).length > 0 ? php : null
}

export function readServiceTurbopanelExtension(
  service: Record<string, unknown>
): ComposeServiceTurbopanelExtension | null {
  if (!(TURBOPANEL_SERVICE_EXTENSION_KEY in service)) return {}
  return parseServiceTurbopanelExtension(service[TURBOPANEL_SERVICE_EXTENSION_KEY])
}

export function isSiteComposeService(service: Record<string, unknown>): boolean {
  const extension = readServiceTurbopanelExtension(service)
  if (extension === null) return false
  return extension.serviceKind === 'site'
}

/** True for `serviceKind: node` — a host-supervised Git-backed process. */
export function isNodeComposeService(service: Record<string, unknown>): boolean {
  const extension = readServiceTurbopanelExtension(service)
  if (extension === null) return false
  return extension.serviceKind === 'node'
}

/** Kinds that are not Docker services and therefore need no `image`/`build`. */
export function isHostNativeServiceKind(kind: ComposeServiceKind | undefined): boolean {
  return kind === 'site' || kind === 'node'
}

/**
 * Patch shape for {@link patchServiceTurbopanelExtension}.
 *
 * Identical to the flat field set except that `source` also accepts `null`,
 * which *clears* the binding — omitting the key keeps whatever is there, so
 * without a distinct "no source" value a caller could add a binding but never
 * remove one.
 *
 * Built on {@link ComposeServiceExtensionFields}, not the narrowed union: a
 * patch is a set of edits arriving one at a time, so it is legitimately
 * mid-flight between two kinds — a form that has just switched `serviceKind`
 * still holds the previous kind's values until
 * {@link dropFieldsForOtherKinds} clears them.
 */
export type ComposeServiceTurbopanelExtensionPatch = Omit<
  ComposeServiceExtensionFields,
  'source'
> & { source?: ComposeServiceSourceExtension | null }

/**
 * Clear the fields that belong to a `serviceKind` other than the one now set.
 *
 * `railpack` goes with them: it is a container-only build backend —
 * `site` and `node` have their own build and runtime lanes, and the
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
  // One loop over {@link SERVICE_KIND_FIELD_TABLE} rather than a hand-listed
  // `delete` per kind: PHP belongs to a site, a container's runtime comes from
  // its image, where content comes from is a site question, and a container has
  // no principal to run as — every one of those is already recorded in the
  // table, and listing them again here is how the two drift.
  const { allowedFields } = SERVICE_KIND_FIELD_TABLE[next.serviceKind ?? 'container']
  const fields = next as Record<string, unknown>
  for (const field of Object.keys(SERVICE_EXTENSION_FIELDS)) {
    if (allowedFields.has(field)) continue
    delete fields[field]
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

  // Every persisted field is whitelisted here — a key missing from this
  // mapping is silently dropped on every patch, which is how `php` was once
  // being lost. Unset and empty values are pruned below, so key order here is
  // the persisted YAML key order.
  const cleaned: Record<string, unknown> = {
    serviceKind: next.serviceKind,
    engine: next.engine,
    root: next.root,
    sourceKind: next.sourceKind,
    framework: next.framework,
    nodeVersion: next.nodeVersion,
    packageManager: next.packageManager,
    appMode: next.appMode,
    // Only `false` is persisted — `true` is the default and would just be
    // noise in the YAML; toggling back on removes the key.
    enabled: next.enabled === false ? false : undefined,
    documentRoot: next.documentRoot,
    startupFile: next.startupFile,
    principal: next.principal,
    description: next.description,
    source: next.source ? { ...next.source } : undefined,
    php:
      next.php && Object.keys(next.php).length > 0 ? { ...next.php } : undefined,
    cron:
      next.cron && next.cron.length > 0
        ? next.cron.map((job) => ({ ...job }))
        : undefined,
    hosting:
      next.hosting && next.hosting.length > 0
        ? next.hosting.map((entry) => ({ ...entry }))
        : undefined,
  }
  for (const key of Object.keys(cleaned)) {
    if (cleaned[key] == null || cleaned[key] === '') delete cleaned[key]
  }

  if (Object.keys(cleaned).length === 0) {
    const { [TURBOPANEL_SERVICE_EXTENSION_KEY]: _removed, ...rest } = service
    return rest
  }

  return {
    ...service,
    [TURBOPANEL_SERVICE_EXTENSION_KEY]: cleaned,
  }
}

/**
 * Engine a site gets when its compose block does not name one. Mirrors
 * `DEFAULT_SITE_ENGINE` in the instance's `lib/compose/site.ts`, which is where
 * the default is actually resolved.
 */
export const DEFAULT_SITE_ENGINE: SiteEngine = 'caddy'

/**
 * PHP series TurboPanel supports. Mirrors `SUPPORTED_PHP_SERIES` on the
 * instance, which mirrors the daemon's runtime registry.
 *
 * This is the *supported* list, not the *installed* list: a project's
 * environments can span servers, so "installed here" is not well defined in a
 * compose editor. Picking an unsupported series is a hard error at prepare;
 * picking a supported one the target host lacks is a warning, because the
 * deploy installs it.
 */
export const SUPPORTED_PHP_SERIES: readonly string[] = ['8.3', '8.4']

/**
 * Extensions installed on every PHP series whether or not a site asks.
 *
 * Deliberately **not** offered as choices: presenting `bcmath` as something to
 * "add" when it is always present would be misleading. Mirrors
 * `baselineExtensions` in the daemon's runtime registry.
 */
export const BASELINE_PHP_EXTENSIONS: readonly string[] = [
  'bcmath',
  'curl',
  'gd',
  'mbstring',
  'mysql',
  'opcache',
  'sqlite3',
  'xml',
  'zip',
]

/**
 * Extensions a site may opt into.
 *
 * Host-global per series: `extension=` is `PHP_INI_SYSTEM` and there is no
 * per-pool loading, so opting in loads it for **every** site on that series.
 * The form has to say so rather than implying per-site isolation.
 */
export const OPTIONAL_PHP_EXTENSIONS: readonly string[] = [
  'apcu',
  'bz2',
  'gmp',
  'igbinary',
  'imagick',
  'intl',
  'ldap',
  'memcached',
  'msgpack',
  'pgsql',
  'redis',
  'snmp',
  'soap',
  'tidy',
  'yaml',
  'zstd',
]

/** Everything a site may name. Mirrors the instance's own union. */
export const ALLOWED_PHP_EXTENSIONS: readonly string[] = [
  ...BASELINE_PHP_EXTENSIONS,
  ...OPTIONAL_PHP_EXTENSIONS,
]

/** Series a PHP site gets when it names none. Mirrors the instance default. */
export const DEFAULT_PHP_SERIES = '8.4'

/**
 * Node series TurboPanel offers in pickers. Mirrors `SUPPORTED_NODE_SERIES`
 * on the instance, which mirrors the daemon's runtime registry. Advisory like
 * the PHP list: the deploy vendors what the operator picked.
 */
export const SUPPORTED_NODE_SERIES: readonly string[] = ['22', '24']

/** Series a node app gets when it pins none. Mirrors the instance default. */
export const DEFAULT_NODE_SERIES = '24'

export const SITE_ENGINE_OPTIONS: readonly {
  value: SiteEngine
  label: string
  deployable: boolean
}[] = [
  {
    value: 'caddy',
    label: 'Caddy — static and PHP, nothing to configure',
    deployable: true,
  },
  { value: 'nginx', label: 'nginx — static and PHP-FPM', deployable: true },
  {
    value: 'apache',
    // Never mod_php: Apache reaches php-fpm over mod_proxy_fcgi. `.htaccess`
    // is real and worth naming — the vhost already emits `AllowOverride All`.
    label: 'Apache — static and PHP-FPM, .htaccess support',
    deployable: true,
  },
  {
    value: 'openlitespeed',
    // Not static-only: OLS runs PHP through a per-vhost LSAPI processor.
    label: 'OpenLiteSpeed — static and PHP via LSAPI',
    deployable: true,
  },
]
