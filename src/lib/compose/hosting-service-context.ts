/**
 * Hosting-panel context derived from merged compose services.
 * Surfaces traditional-web engine rules the deploy path already enforces
 * (Apache mod_php + SetEnv; nginx/OLS static; Docker bridge env injection).
 */

import {
  isTraditionalWebComposeService,
  readServiceTurbopanelExtension,
  type TraditionalWebEngine,
} from './service-kind'
import type { ComposeDocument } from './types'

export type HostingPhpApplicability = 'applicable' | 'ignored' | 'not_applicable'

export type HostingWebEnvMode =
  | 'apache_setenv'
  | 'file_only'
  | 'ignored'
  | 'container_variables'

export type HostingServiceContext = {
  composeServiceName: string
  kind: 'container' | 'traditional-web'
  engine: TraditionalWebEngine | undefined
  /** Other traditional-web compose service names in the same document. */
  traditionalSiblingNames: string[]
  phpApplicability: HostingPhpApplicability
  webEnvMode: HostingWebEnvMode
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
export function traditionalWebEnvKeyForService(composeServiceName: string): string {
  let sanitized = composeServiceName.replaceAll(/\W/g, '_')
  if (/^\d/.test(sanitized)) {
    sanitized = `_${sanitized}`
  }
  return `TURBOPANEL_TRADITIONAL_WEB_${sanitized.toUpperCase()}_URL`
}

function engineLabel(engine: TraditionalWebEngine | undefined): string {
  if (engine === 'apache') return 'Apache'
  if (engine === 'openlitespeed') return 'OpenLiteSpeed'
  if (engine === 'nginx') return 'nginx'
  return 'traditional-web'
}

function phpApplicabilityFor(
  kind: HostingServiceContext['kind'],
  engine: TraditionalWebEngine | undefined,
): HostingPhpApplicability {
  if (kind !== 'traditional-web') return 'not_applicable'
  if (engine === 'apache') return 'applicable'
  return 'ignored'
}

function webEnvModeFor(
  kind: HostingServiceContext['kind'],
  engine: TraditionalWebEngine | undefined,
): HostingWebEnvMode {
  if (kind !== 'traditional-web') return 'container_variables'
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
  const traditionalSiblingNames = Object.keys(services)
    .filter(
      (name) =>
        name !== composeServiceName &&
        isTraditionalWebComposeService(services[name] ?? {}),
    )
    .sort((a, b) => a.localeCompare(b))

  if (!service) {
    return {
      composeServiceName,
      kind: 'container',
      engine: undefined,
      traditionalSiblingNames,
      phpApplicability: 'not_applicable',
      webEnvMode: 'container_variables',
    }
  }

  const traditional = isTraditionalWebComposeService(service)
  const extension = readServiceTurbopanelExtension(service) ?? {}
  const engine = traditional ? extension.engine ?? 'nginx' : undefined
  const kind = traditional ? 'traditional-web' : 'container'

  return {
    composeServiceName,
    kind,
    engine,
    traditionalSiblingNames,
    phpApplicability: phpApplicabilityFor(kind, engine),
    webEnvMode: webEnvModeFor(kind, engine),
  }
}

export function hostingServiceKindLabel(context: HostingServiceContext): string {
  if (context.kind === 'traditional-web') {
    return `Traditional web · ${engineLabel(context.engine)}`
  }
  return 'Container'
}

export function hostingPhpSectionCopy(context: HostingServiceContext): {
  title: string
  hint: string
  showFields: boolean
} {
  if (context.phpApplicability === 'applicable') {
    return {
      title: 'PHP settings (Apache mod_php)',
      hint:
        'Deploy installs libapache2-mod-php<version> when set and applies memory_limit / max_execution_time as vhost php_admin_value.',
      showFields: true,
    }
  }
  if (context.phpApplicability === 'ignored') {
    return {
      title: 'PHP settings (not used)',
      hint: `${engineLabel(context.engine)} traditional-web is static-only — PHP hints are ignored. Use an Apache traditional-web service for mod_php, or share a hostname with path prefixes (e.g. / for static, /php for Apache).`,
      showFields: false,
    }
  }
  return {
    title: 'PHP settings',
    hint:
      'PHP options apply only to Apache traditional-web services. Containers use their image runtime; host PHP packages are not installed from this panel.',
    showFields: false,
  }
}

export function hostingWebEnvSectionCopy(context: HostingServiceContext): {
  title: string
  hint: string
  showFields: boolean
} {
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
        'Static KEY=VALUE pairs are written to .turbopanel/hosting.env under the site directory. nginx does not inject them into the process — use them from your app/scripts, or prefer Apache traditional-web for SetEnv.',
      showFields: true,
    }
  }
  if (context.webEnvMode === 'ignored') {
    return {
      title: 'Web environment (not applied)',
      hint:
        'OpenLiteSpeed traditional-web is static-only — web env hints are not applied to the process. Prefer hosting-scoped variables only when you later switch engines, or use Apache for SetEnv.',
      showFields: false,
    }
  }
  return {
    title: 'Web environment',
    hint:
      'Static web.env is for traditional-web host stacks. For this container service, prefer Hosting variables below (forRuntime) — they inject into compose at deploy.',
    showFields: false,
  }
}

export function hostingPathPrefixHint(context: HostingServiceContext): string {
  if (context.traditionalSiblingNames.length > 0) {
    const siblings = context.traditionalSiblingNames.join(', ')
    return `Optional. Same hostname on another hosting can use a different prefix (e.g. / for static nginx, /php for Apache). Other traditional-web services in this environment: ${siblings}.`
  }
  return 'Optional. Same hostname on another hosting can use a different prefix (e.g. / for static nginx, /php for a PHP site).'
}

export function hostingDockerBridgeHint(
  context: HostingServiceContext,
): string | null {
  if (context.kind !== 'container' || context.traditionalSiblingNames.length === 0) {
    return null
  }
  const exampleKey = traditionalWebEnvKeyForService(
    context.traditionalSiblingNames[0] ?? 'site',
  )
  return `This environment also has traditional-web services. On deploy, containers receive ${exampleKey} (and TURBOPANEL_TRADITIONAL_WEB_ENDPOINTS JSON) pointing at http://host.docker.internal:<listenPort> so apps can call host-native sites.`
}

/** When PHP/env fields are hidden, still reveal them if the editor already has values so operators can clear stale data. */
export function shouldRevealOptionalHostingFields(
  showByDefault: boolean,
  hasStoredValues: boolean,
): boolean {
  return showByDefault || hasStoredValues
}
