/**
 * Hosting-panel context derived from merged compose services.
 * Surfaces site engine rules the deploy path already enforces
 * (PHP on all three engines, by different mechanisms; Apache-only SetEnv;
 * Docker bridge env injection).
 */

import {
  hostingEntryKey,
  type ComposeHostingExtensionEntry,
} from './hosting-extension'
import {
  DEFAULT_SITE_ENGINE,
  isNodeComposeService,
  isSiteComposeService,
  readServiceTurbopanelExtension,
  TURBOPANEL_SERVICE_EXTENSION_KEY,
  type ComposeServiceKind,
  type SiteEngine,
} from './service-kind'
import type { ComposeDocument } from './types'

export type HostingPhpApplicability = 'applicable' | 'not_applicable'

export type HostingWebEnvMode =
  | 'caddy_env'
  | 'apache_setenv'
  | 'file_only'
  | 'ignored'
  | 'container_variables'
  | 'node_unit_environment'

export type HostingServiceContext = {
  composeServiceName: string
  /**
   * The document's own `serviceKind`, not a two-way approximation of it.
   *
   * `node` used to collapse into `container` here, which made every rule keyed
   * off this field answer a native app as though it were a Docker service —
   * most visibly `targetPort`, which the panel then offered and wrote into
   * `x-turbopanel.hosting` for a kind the control plane refuses it on
   * (`hostingTargetPortAuthorable`). A service kind the editor cannot name is a
   * service kind the editor gets wrong, so all three are named.
   */
  kind: ComposeServiceKind
  engine: SiteEngine | undefined
  /** Other site compose service names in the same document. */
  siteSiblingNames: string[]
  phpApplicability: HostingPhpApplicability
  webEnvMode: HostingWebEnvMode
  /**
   * Routes this service declares in `x-turbopanel.hosting`, in document order.
   *
   * Present whenever the compose document authors any, which is exactly when
   * the instance's deploy-prepare will materialize a compose-owned `hosting`
   * row per entry — and therefore exactly when the panel's own hosting form
   * must render one row per entry and send edits back through the compose
   * document rather than through `PATCH /hostings`, which answers such a write
   * with `409 hosting_owned_by_compose`.
   *
   * This is the source of truth the hosting panel reads — never
   * `hostingsByService[serviceId][0]`, which both collapses a multi-route
   * service to its first row and cannot say who authored it.
   */
  composeHostingEntries: ComposeHostingExtensionEntry[]
}

/**
 * True when compose authors this service's ingress, so the hosting form must
 * edit the document rather than the row. Derived rather than stored: an entry
 * list that is non-empty *is* the ownership claim.
 */
export function hasComposeAuthoredHosting(
  context: HostingServiceContext,
): boolean {
  return context.composeHostingEntries.length > 0
}

function isPlainServiceMap(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readComposeServiceMap(
  document: ComposeDocument,
): Record<string, Record<string, unknown>> {
  const services = document.data.services
  if (!isPlainServiceMap(services)) return {}
  const out: Record<string, Record<string, unknown>> = {}
  for (const [name, value] of Object.entries(services)) {
    if (isPlainServiceMap(value)) out[name] = value
  }
  return out
}

/** Sanitize compose service name the same way the daemon builds bridge env keys. */
export function siteEnvKeyForService(composeServiceName: string): string {
  let sanitized = composeServiceName.replaceAll(/\W/g, '_')
  if (/^\d/.test(sanitized)) {
    sanitized = `_${sanitized}`
  }
  return `TURBOPANEL_SITE_${sanitized.toUpperCase()}_URL`
}

function engineLabel(engine: SiteEngine | undefined): string {
  if (engine === 'caddy') return 'Caddy'
  if (engine === 'apache') return 'Apache'
  if (engine === 'openlitespeed') return 'OpenLiteSpeed'
  if (engine === 'nginx') return 'nginx'
  return 'site'
}

/**
 * Every site engine runs PHP — only the mechanism differs (per-site
 * php-fpm pool for nginx/Apache, per-vhost LSAPI process for OpenLiteSpeed), and
 * that is a deploy-path detail, not a reason to hide the fields.
 */
function phpApplicabilityFor(
  kind: HostingServiceContext['kind'],
): HostingPhpApplicability {
  return kind === 'site' ? 'applicable' : 'not_applicable'
}

/** `Site · Caddy` / `Node app` / `Container`, as a badge reads. */
function serviceKindLabel(kind: HostingServiceContext['kind']): string {
  if (kind === 'node') return 'Node app'
  return 'Container'
}

function webEnvModeFor(
  kind: HostingServiceContext['kind'],
  engine: SiteEngine | undefined,
): HostingWebEnvMode {
  // A native app is not a container: there is no compose service left to
  // inject variables into, so the container advice would send an operator to a
  // control that cannot reach the process.
  if (kind === 'node') return 'node_unit_environment'
  if (kind !== 'site') return 'container_variables'
  // Caddy's `php_fastcgi` takes an `env` subdirective, so web.env reaches the
  // PHP process — the same guarantee Apache's SetEnv gives, which nginx cannot.
  if (engine === 'caddy') return 'caddy_env'
  if (engine === 'apache') return 'apache_setenv'
  if (engine === 'openlitespeed') return 'ignored'
  return 'file_only'
}

export function resolveHostingServiceContext(
  document: ComposeDocument,
  composeServiceName: string,
): HostingServiceContext {
  const services = readComposeServiceMap(document)
  const service = services[composeServiceName]
  const siteSiblingNames = Object.keys(services)
    .filter(
      (name) =>
        name !== composeServiceName &&
        isSiteComposeService(services[name] ?? {}),
    )
    .sort((a, b) => a.localeCompare(b))

  if (!service) {
    return {
      composeServiceName,
      kind: 'container',
      engine: undefined,
      siteSiblingNames,
      phpApplicability: 'not_applicable',
      webEnvMode: 'container_variables',
      composeHostingEntries: [],
    }
  }

  const isSite = isSiteComposeService(service)
  const extension = readServiceTurbopanelExtension(service) ?? {}
  const engine = isSite ? extension.engine ?? DEFAULT_SITE_ENGINE : undefined
  const nonSiteKind: ComposeServiceKind = isNodeComposeService(service)
    ? 'node'
    : 'container'
  const kind: ComposeServiceKind = isSite ? 'site' : nonSiteKind

  return {
    composeServiceName,
    kind,
    engine,
    siteSiblingNames,
    phpApplicability: phpApplicabilityFor(kind),
    webEnvMode: webEnvModeFor(kind, engine),
    composeHostingEntries: extension.hosting ?? [],
  }
}

export function hostingServiceKindLabel(context: HostingServiceContext): string {
  if (context.kind === 'site') {
    return `Site · ${engineLabel(context.engine)}`
  }
  return serviceKindLabel(context.kind)
}

/**
 * What to say where the Target port field would have been.
 *
 * Both host-native kinds are answered by a host process on a loopback port
 * TurboPanel allocates, so neither may pin one — but *which* process differs,
 * and naming it is the difference between "the field is missing" and "the
 * daemon already decided this". A container keeps the field, so it has no hint.
 */
export function hostingTargetPortHint(
  context: HostingServiceContext,
): string | null {
  if (context.kind === 'site') {
    return `Target port is allocated by TurboPanel: deploy gives this site its own ${
      engineLabel(context.engine)
    } vhost on a loopback port and routes the hostname to it.`
  }
  if (context.kind === 'node') {
    return 'Target port is allocated by TurboPanel: this service runs as a host-supervised Node process under a generated systemd unit, which is told the port to bind through PORT, and hosting Caddy proxies the hostname to it.'
  }
  return null
}

/**
 * How this engine actually runs PHP. The hint names the real mechanism because
 * it is what an operator sees on the host — a pool process per site, or an
 * lsphp process per vhost — and because the isolation story differs: OpenLiteSpeed's
 * suEXEC identity is the process itself, where nginx/Apache get it from the pool.
 */
function phpRuntimeCopy(engine: SiteEngine | undefined): {
  title: string
  hint: string
} {
  if (engine === 'openlitespeed') {
    return {
      title: 'PHP settings (OpenLiteSpeed LSAPI)',
      hint:
        'Deploy gives this vhost its own lsphp LSAPI process under suEXEC (running as the assigned principal) and applies memory_limit / max_execution_time as phpIniOverride php_admin_value.',
    }
  }
  const label = engineLabel(engine)
  const handler = engine === 'apache' ? 'mod_proxy_fcgi' : 'fastcgi_pass'
  return {
    title: `PHP settings (${label} php-fpm)`,
    hint: `Deploy installs a per-site php-fpm pool, points ${label} at its unix socket via ${handler}, and applies memory_limit / max_execution_time as pool php_admin_value.`,
  }
}

export function hostingPhpSectionCopy(context: HostingServiceContext): {
  title: string
  hint: string
  showFields: boolean
} {
  if (context.phpApplicability === 'applicable') {
    return { ...phpRuntimeCopy(context.engine), showFields: true }
  }
  return {
    title: 'PHP settings',
    hint:
      'PHP options apply only to site services. Containers use their image runtime; host PHP packages are not installed from this panel.',
    showFields: false,
  }
}

export function hostingWebEnvSectionCopy(context: HostingServiceContext): {
  title: string
  hint: string
  showFields: boolean
} {
  if (context.webEnvMode === 'caddy_env') {
    return {
      title: 'Web environment',
      hint:
        'Static KEY=VALUE pairs for this hostname. Deploy writes .turbopanel/hosting.env and injects entries into PHP through the php_fastcgi env directive. Hosting variables marked for runtime merge first; static lines here win on collision. Values containing braces or quotes are dropped — Caddy would reinterpret them.',
      showFields: true,
    }
  }
  if (context.webEnvMode === 'apache_setenv') {
    return {
      title: 'Web environment',
      hint:
        'Static KEY=VALUE pairs for this hostname. Deploy writes .turbopanel/hosting.env and applies entries as Apache SetEnv. Hosting variables marked for runtime merge first; static lines here win on collision.',
      showFields: true,
    }
  }
  if (context.webEnvMode === 'file_only') {
    return {
      title: 'Web environment',
      hint:
        'Static KEY=VALUE pairs are written to .turbopanel/hosting.env under the site directory. nginx does not inject them into the process — use them from your app/scripts, or use Caddy or Apache, which inject them into PHP.',
      showFields: true,
    }
  }
  if (context.webEnvMode === 'node_unit_environment') {
    return {
      title: 'Web environment (not applied)',
      hint:
        'Static web.env is for site host stacks. This node service runs as a host-supervised process, not a container and not behind a php-fpm pool — give it configuration through the environment variables the generated unit carries, or through hosting-scoped variables below.',
      showFields: false,
    }
  }
  if (context.webEnvMode === 'ignored') {
    return {
      title: 'Web environment (not applied)',
      hint:
        'OpenLiteSpeed does not inject web env into the serving process — these hints are not applied. Prefer hosting-scoped variables, or use Apache site for SetEnv. (PHP hints above do apply.)',
      showFields: false,
    }
  }
  return {
    title: 'Web environment',
    hint:
      'Static web.env is for site host stacks. For this container service, prefer Hosting variables below (forRuntime) — they inject into compose at deploy.',
    showFields: false,
  }
}

export function hostingPathPrefixHint(context: HostingServiceContext): string {
  if (context.siteSiblingNames.length > 0) {
    const siblings = context.siteSiblingNames.join(', ')
    return `Optional. Same hostname on another hosting can use a different prefix (e.g. / for the marketing site, /app for the application). Other site services in this environment: ${siblings}.`
  }
  return 'Optional. Same hostname on another hosting can use a different prefix (e.g. / for the marketing site, /app for the application).'
}

export function hostingDockerBridgeHint(
  context: HostingServiceContext,
): string | null {
  if (context.kind !== 'container' || context.siteSiblingNames.length === 0) {
    return null
  }
  const exampleKey = siteEnvKeyForService(
    context.siteSiblingNames[0] ?? 'site',
  )
  return `This environment also has site services. On deploy, containers receive ${exampleKey} (and TURBOPANEL_SITE_ENDPOINTS JSON) pointing at http://host.docker.internal:<listenPort> so apps can call host-native sites.`
}

/** When PHP/env fields are hidden, still reveal them if the editor already has values so operators can clear stale data. */
export function shouldRevealOptionalHostingFields(
  showByDefault: boolean,
  hasStoredValues: boolean,
): boolean {
  return showByDefault || hasStoredValues
}

/**
 * The `hosting` entries one service declares in **this** document.
 *
 * Separate from {@link resolveHostingServiceContext} because the panel needs
 * the answer for two different documents: the merged one (what will deploy,
 * and therefore what to render) and the environment overlay (what this surface
 * can actually author, and therefore what to let an operator edit).
 */
export function readComposeHostingEntries(
  document: ComposeDocument,
  composeServiceName: string,
): ComposeHostingExtensionEntry[] {
  const service = readComposeServiceMap(document)[composeServiceName]
  if (!service) return []
  return readServiceTurbopanelExtension(service)?.hosting ?? []
}

/**
 * Index of the entry routing `route` ({@link hostingEntryKey}), or `-1`.
 *
 * Matched on the route rather than the position: the overlay lists only the
 * entries it authors, so its indices do not line up with the merged list a row
 * was rendered from.
 */
export function findComposeHostingEntryIndex(
  entries: readonly ComposeHostingExtensionEntry[],
  route: string,
): number {
  return entries.findIndex((entry) => hostingEntryKey(entry) === route)
}

function cloneComposeData(
  data: Record<string, unknown>,
): Record<string, unknown> {
  return structuredClone(data)
}

/**
 * `document` with one service's `x-turbopanel.hosting` list replaced.
 *
 * Whole-list replacement, because that is the only edit the overlay merge can
 * express: `hosting` is a plain sequence, so an overlay list is **appended** to
 * the base one rather than matched entry-by-entry. Writing the list an operator
 * sees is therefore only correct against the document that already owns it —
 * which is why the panel edits an inherited route nowhere but the project
 * compose.
 */
export function writeComposeHostingEntries(
  document: ComposeDocument,
  composeServiceName: string,
  entries: readonly ComposeHostingExtensionEntry[],
): ComposeDocument {
  const data = cloneComposeData(document.data)
  const services = isPlainServiceMap(data.services)
    ? { ...data.services }
    : {}
  const service = isPlainServiceMap(services[composeServiceName])
    ? { ...(services[composeServiceName] as Record<string, unknown>) }
    : {}
  const extension = isPlainServiceMap(service[TURBOPANEL_SERVICE_EXTENSION_KEY])
    ? { ...(service[TURBOPANEL_SERVICE_EXTENSION_KEY] as Record<string, unknown>) }
    : {}

  if (entries.length === 0) delete extension.hosting
  else extension.hosting = entries.map((entry) => ({ ...entry }))

  if (Object.keys(extension).length === 0) {
    delete service[TURBOPANEL_SERVICE_EXTENSION_KEY]
  } else {
    service[TURBOPANEL_SERVICE_EXTENSION_KEY] = extension
  }
  services[composeServiceName] = service
  data.services = services

  return { ...document, data }
}
