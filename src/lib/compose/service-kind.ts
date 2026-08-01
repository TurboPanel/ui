/** Per-service `x-turbopanel` extension (Compose `services.<name>.x-turbopanel`). */

export const TURBOPANEL_SERVICE_EXTENSION_KEY = 'x-turbopanel'

export type ComposeServiceKind = 'container' | 'traditional-web'

export type TraditionalWebEngine = 'apache' | 'nginx' | 'openlitespeed'

export type ComposeServiceTurbopanelExtension = {
  serviceKind?: ComposeServiceKind
  engine?: TraditionalWebEngine
  /**
   * Document-root segment under the daemon site directory (relative only).
   * Default `public` when omitted for traditional-web.
   */
  root?: string
}

const SERVICE_KINDS = new Set<ComposeServiceKind>(['container', 'traditional-web'])
const TRADITIONAL_WEB_ENGINES = new Set<TraditionalWebEngine>([
  'apache',
  'nginx',
  'openlitespeed',
])

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

export function parseServiceTurbopanelExtension(
  value: unknown,
): ComposeServiceTurbopanelExtension | null {
  if (value === null || value === undefined) return {}
  if (!isPlainMapping(value)) return null

  const extension: ComposeServiceTurbopanelExtension = {}
  const serviceKind = readServiceKind(value.serviceKind)
  if (serviceKind) extension.serviceKind = serviceKind
  const engine = readTraditionalWebEngine(value.engine)
  if (engine) extension.engine = engine
  if (typeof value.root === 'string') {
    const root = value.root.trim()
    if (root.length > 0) extension.root = root
  }

  return extension
}

export function readServiceTurbopanelExtension(
  service: Record<string, unknown>,
): ComposeServiceTurbopanelExtension | null {
  if (!(TURBOPANEL_SERVICE_EXTENSION_KEY in service)) return {}
  return parseServiceTurbopanelExtension(service[TURBOPANEL_SERVICE_EXTENSION_KEY])
}

export function isTraditionalWebComposeService(
  service: Record<string, unknown>,
): boolean {
  const extension = readServiceTurbopanelExtension(service)
  if (extension === null) return false
  return extension.serviceKind === 'traditional-web'
}

export function patchServiceTurbopanelExtension(
  service: Record<string, unknown>,
  patch: ComposeServiceTurbopanelExtension,
): Record<string, unknown> {
  const current = readServiceTurbopanelExtension(service) ?? {}
  const next: ComposeServiceTurbopanelExtension = { ...current, ...patch }

  if (next.serviceKind !== 'traditional-web') {
    delete next.engine
    delete next.root
  }

  const cleaned: Record<string, unknown> = {}
  if (next.serviceKind) cleaned.serviceKind = next.serviceKind
  if (next.engine) cleaned.engine = next.engine
  if (next.root) cleaned.root = next.root

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
