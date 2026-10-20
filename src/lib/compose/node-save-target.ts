import { emptyComposeDocument, mergeComposeOverlay } from '@/lib/compose'
import {
  readServiceTurbopanelExtension,
  TURBOPANEL_SERVICE_EXTENSION_KEY,
} from '@/lib/compose/service-kind'
import type { ComposeDocument } from '@/lib/instance-api'

type Mapping = Record<string, unknown>

function isMapping(value: unknown): value is Mapping {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function servicesOf(document: ComposeDocument | null | undefined): Mapping {
  const services = document?.data.services
  return isMapping(services) ? { ...services } : {}
}

/**
 * The service as it really is: the Base's entry with the environment's own
 * changes laid over it. The Node settings read this (to seed the form and to
 * tell what kind of app it is), so a save into an environment that holds only
 * a few keys never makes the settings vanish or blank the other values.
 */
export function effectiveService(
  projectCompose: ComposeDocument | null | undefined,
  environmentCompose: ComposeDocument | null | undefined,
  serviceName: string
): unknown {
  const merged = environmentCompose
    ? mergeComposeOverlay(projectCompose ?? null, environmentCompose)
    : projectCompose
  return servicesOf(merged)[serviceName]
}

/**
 * The markers that let an overlay service save without an image or build:
 * its host-native kind, and a Railpack build kind on its source. Copied from
 * the effective service, so the environment entry never loses them.
 */
function withNativeMarkers(entry: Mapping, effective: unknown): Mapping {
  const merged = isMapping(effective) ? readServiceTurbopanelExtension(effective) : null
  if (merged?.serviceKind === undefined) return entry
  const own = isMapping(entry[TURBOPANEL_SERVICE_EXTENSION_KEY])
    ? { ...(entry[TURBOPANEL_SERVICE_EXTENSION_KEY] as Mapping) }
    : {}
  own.serviceKind = merged.serviceKind
  if (merged.source?.buildKind !== undefined) {
    const ownSource = isMapping(own.source) ? (own.source as Mapping) : {}
    own.source = { buildKind: merged.source.buildKind, ...ownSource }
  }
  return { ...entry, [TURBOPANEL_SERVICE_EXTENSION_KEY]: own }
}

/**
 * The compose document a Node settings save writes, and which one it goes to.
 *
 * Seen from an environment, a save always lands in that environment, even when
 * the Base defines the service: the environment gets an entry holding only what
 * it changes (plus the markers above), layered over the Base. Only a view with
 * no environment edits the Base.
 */
export function composeForNodeSave(
  input: Readonly<{
    environmentId: string | null
    projectCompose: ComposeDocument | null | undefined
    environmentCompose: ComposeDocument | null | undefined
    serviceName: string
    /** The service with the Base and the environment merged. */
    effective: unknown
    patch: (current: Mapping) => unknown
  }>
): Readonly<{ target: 'environment' | 'project'; compose: ComposeDocument }> {
  const toEnvironment = input.environmentId !== null && input.environmentId !== ''
  const document: ComposeDocument = toEnvironment
    ? (input.environmentCompose ?? emptyComposeDocument())
    : (input.projectCompose ?? emptyComposeDocument())
  const services = servicesOf(document)
  const current = isMapping(services[input.serviceName])
    ? (services[input.serviceName] as Mapping)
    : {}
  // The markers go in first: the patch drops fields that do not fit the kind, so
  // an entry with no kind yet would lose the Node settings it is being given.
  const seeded = toEnvironment ? withNativeMarkers(current, input.effective) : current
  services[input.serviceName] = input.patch(seeded)
  return {
    target: toEnvironment ? 'environment' : 'project',
    compose: { ...document, data: { ...document.data, services } },
  }
}
