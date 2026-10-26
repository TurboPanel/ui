/**
 * Hosting-panel context derived from merged compose services.
 * Surfaces site engine rules the deploy path already enforces
 * (PHP on all three engines, by different mechanisms; SetEnv on Apache,
 * rewrite rules on OpenLiteSpeed; Docker bridge env injection).
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
  | 'openlitespeed_rewrite'
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

/**
 * `Site` / `Node app` / `Container`, as a badge reads. The hosting form never
 * names the web server product (the Services tab is where it is picked).
 */
function serviceKindLabel(kind: HostingServiceContext['kind']): string {
  if (kind === 'site') return 'Site'
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
  if (engine === 'openlitespeed') return 'openlitespeed_rewrite'
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
    return 'TurboPanel picks the port: the deploy sets this site up on its web server on a private port and sends the hostname there.'
  }
  if (context.kind === 'node') {
    return 'TurboPanel picks the port: this Node app runs on the server as the app’s service, which is told the port through PORT, and TurboPanel’s web server sends the hostname to it.'
  }
  return null
}

/**
 * How this site runs PHP, in plain words: its own PHP process on the engine
 * that runs PHP in-process, its own PHP worker pool on the others. Both run as
 * the site's Hosting Account.
 */
function phpRuntimeCopy(engine: SiteEngine | undefined): {
  title: string
  hint: string
} {
  if (engine === 'openlitespeed') {
    return {
      title: 'PHP settings',
      hint: 'The deploy gives this site its own PHP process, running as the site’s Hosting Account, and applies the memory and time limits to it.',
    }
  }
  return {
    title: 'PHP settings',
    hint: 'The deploy gives this site its own PHP worker pool, running as the site’s Hosting Account, and applies the memory and time limits to it.',
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
    hint: 'PHP options apply only to site services. An app in a container uses the PHP its image brings; this screen does not install PHP on the server for it.',
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
      hint: 'KEY=VALUE lines for this hostname, saved in the site’s settings file and handed to PHP on the next deploy. Hosting variables meant for the running app are added first; a line here wins when both set the same name. A value with braces or quotes is left out, because the web server would read it as part of its own settings.',
      showFields: true,
    }
  }
  if (context.webEnvMode === 'apache_setenv') {
    return {
      title: 'Web environment',
      hint: 'KEY=VALUE lines for this hostname, saved in the site’s settings file and handed to PHP on the next deploy. Hosting variables meant for the running app are added first; a line here wins when both set the same name.',
      showFields: true,
    }
  }
  if (context.webEnvMode === 'file_only') {
    return {
      title: 'Web environment',
      hint: 'KEY=VALUE lines are saved in the site’s settings file (.turbopanel/hosting.env in the site folder) on the next deploy. This site’s web server does not hand them to PHP, so read them from your app or scripts, or pick a web server under Services that hands them to PHP.',
      showFields: true,
    }
  }
  if (context.webEnvMode === 'node_unit_environment') {
    return {
      title: 'Web environment (not applied)',
      hint: 'These lines are for sites. This Node app runs on the server as the app’s service, not in a container and not in a PHP worker pool, so give it settings through its environment variables or the hosting variables below.',
      showFields: false,
    }
  }
  if (context.webEnvMode === 'openlitespeed_rewrite') {
    return {
      title: 'Web environment',
      hint: 'KEY=VALUE lines for this hostname, saved in the site’s settings file and handed to PHP on the next deploy through the site’s own rewrite rules. Hosting variables meant for the running app are added first; a line here wins when both set the same name. A value that contains a space, comma, quote, backslash, $, % or a bracket is left out with a warning. If a required database setting is missing, the deploy stops.',
      showFields: true,
    }
  }
  return {
    title: 'Web environment',
    hint: 'These lines are for sites. For an app in a container, use the hosting variables below: they reach the app on the next deploy.',
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
  return `This environment also has site services. On deploy, the containers get ${exampleKey} (and TURBOPANEL_SITE_ENDPOINTS, which lists them all) with the address of each site, so apps can call the sites on this server.`
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
