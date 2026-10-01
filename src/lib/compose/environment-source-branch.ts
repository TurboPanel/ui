/**
 * Per-environment branch for a Git-bound service.
 *
 * A service is bound to a repository in the project's compose document
 * (`services.<name>.x-turbopanel.source`). One environment can build a different
 * branch — and opt out of push deploys — without copying the service: its own
 * document overlays the project's, so the override is the smallest overlay that
 * still saves.
 *
 * "Still saves" is the constraint that shapes the writer. The instance refuses
 * an overlay service that defines neither `image` nor `build` unless the service
 * is host-native (`serviceKind: site | node`) or built by Railpack, so the
 * overlay carries exactly those markers from the merged service and nothing else.
 * A plain image service cannot be overridden this way and is reported as such.
 *
 * Pure: the callers own the queries and the save, this owns the rule.
 */

import type { ComposeDocument } from '@/lib/compose'
import { mergeComposeOverlay, normalizeCompose } from '@/lib/compose'
import { isComposeTaggedValue } from '@/lib/compose/tags'
import {
  isHostNativeServiceKind,
  readServiceTurbopanelExtension,
  TURBOPANEL_SERVICE_EXTENSION_KEY,
  type ComposeServiceKind,
} from '@/lib/compose/service-kind'

type Mapping = Record<string, unknown>

function isMapping(value: unknown): value is Mapping {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** `refs/heads/x` and `x` are the same branch. */
export function normalizeBranch(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  if (trimmed.length === 0) return null
  return trimmed.startsWith('refs/heads/') ? trimmed.slice('refs/heads/'.length) : trimmed
}

export type EnvironmentSourceBinding = Readonly<{
  serviceName: string
  sourceId: string
  /** The branch this environment builds: its own override, else the project's, else the repository default. */
  branch: string | null
  /** Where {@link EnvironmentSourceBinding.branch} came from. */
  branchFrom: 'environment' | 'project' | 'repository' | 'none'
  /** The branch without this environment's override (project document, else repository default). */
  inheritedBranch: string | null
  deployOnPush: boolean
  /** Whether a push-deploy opt-out comes from this environment's own document. */
  deployOnPushOverridden: boolean
  /** False when no minimal overlay can be written; the reason is in {@link EnvironmentSourceBinding.blockedReason}. */
  editable: boolean
  blockedReason: string | null
}>

type ServiceView = Readonly<{
  kind: ComposeServiceKind | undefined
  railpack: boolean
  branch: string | null
  deployOnPush: boolean
  sourceId: string | null
}>

function serviceView(service: unknown): ServiceView {
  const extension = isMapping(service) ? readServiceTurbopanelExtension(service) : undefined
  return {
    kind: extension?.serviceKind,
    railpack: extension?.source?.buildKind === 'railpack',
    branch: normalizeBranch(extension?.source?.branch),
    deployOnPush: extension?.source?.deployOnPush !== false,
    sourceId: extension?.source?.sourceId ?? null,
  }
}

function servicesOf(document: ComposeDocument): Mapping {
  const services = document.data.services
  return isMapping(services) && !isComposeTaggedValue(services) ? services : {}
}

/** The overlay's own entry for a service, when it exists and is plain (not `!override` / `!reset`). */
type OverlayService = Mapping | 'tagged' | null

function overlayServiceOf(environmentCompose: unknown, name: string): OverlayService {
  const raw = servicesOf(normalizeCompose(environmentCompose))[name]
  if (raw === undefined) return null
  if (isComposeTaggedValue(raw) || !isMapping(raw)) return 'tagged'
  return raw
}

function overlayDefinesImageOrBuild(overlayService: OverlayService): boolean {
  if (!isMapping(overlayService)) return false
  return typeof overlayService.image === 'string' || overlayService.build !== undefined
}

function blockedReasonFor(
  merged: ServiceView,
  overlayService: OverlayService
): string | null {
  if (overlayService === 'tagged') {
    return 'This environment replaces or resets the service in its own compose. Edit it in the compose editor.'
  }
  const carriesItsOwnKind = isHostNativeServiceKind(merged.kind) || merged.railpack
  if (carriesItsOwnKind || overlayDefinesImageOrBuild(overlayService)) return null
  return 'This service runs a plain image, so an environment cannot override only its branch. Change it in the compose editor.'
}

/**
 * Every Git-bound service of one environment, as the merged compose sees it.
 *
 * `repositoryDefaultBranch` answers "which branch when nothing names one" for a
 * source id, and `null` when the repository records none.
 */
export function readEnvironmentSourceBindings(params: {
  projectCompose: unknown
  environmentCompose: unknown
  repositoryDefaultBranch: (sourceId: string) => string | null
}): EnvironmentSourceBinding[] {
  const merged = mergeComposeOverlay(params.projectCompose, params.environmentCompose)
  const inherited = mergeComposeOverlay(params.projectCompose, null)
  const mergedServices = servicesOf(merged)
  const inheritedServices = servicesOf(inherited)

  const out: EnvironmentSourceBinding[] = []
  for (const [serviceName, raw] of Object.entries(mergedServices)) {
    const view = serviceView(raw)
    if (view.sourceId === null) continue
    const inheritedView = serviceView(inheritedServices[serviceName])
    const repositoryDefault = normalizeBranch(params.repositoryDefaultBranch(view.sourceId))
    const projectBranch = inheritedView.branch
    const inheritedBranch = projectBranch ?? repositoryDefault
    const branch = view.branch ?? repositoryDefault
    const overlayService = overlayServiceOf(params.environmentCompose, serviceName)
    const blockedReason = blockedReasonFor(view, overlayService)
    out.push({
      serviceName,
      sourceId: view.sourceId,
      branch,
      branchFrom: branchOrigin(view.branch, projectBranch, repositoryDefault),
      inheritedBranch,
      deployOnPush: view.deployOnPush,
      deployOnPushOverridden: view.deployOnPush !== inheritedView.deployOnPush,
      editable: blockedReason === null,
      blockedReason,
    })
  }
  return out.sort((a, b) => a.serviceName.localeCompare(b.serviceName))
}

function branchOrigin(
  mergedBranch: string | null,
  projectBranch: string | null,
  repositoryDefault: string | null
): EnvironmentSourceBinding['branchFrom'] {
  if (mergedBranch !== null && mergedBranch !== projectBranch) return 'environment'
  if (mergedBranch !== null) return 'project'
  return repositoryDefault === null ? 'none' : 'repository'
}

export type EnvironmentSourcePatch = Readonly<{
  /** `null` or blank clears this environment's override; `undefined` leaves it alone. */
  branch?: string | null
  /** `undefined` leaves it alone. */
  deployOnPush?: boolean
}>

function cloneMapping(value: unknown): Mapping {
  return isMapping(value) ? { ...value } : {}
}

/** Set or clear one key so that "same as inherited" never writes an override. */
function applyOverride(
  source: Mapping,
  key: 'branch' | 'deployOnPush',
  desired: string | boolean | null,
  inherited: string | boolean | null
): void {
  if (desired === null || desired === inherited) delete source[key]
  else source[key] = desired
}

function nextBranchOverride(patch: EnvironmentSourcePatch, current: string | null) {
  if (patch.branch === undefined) return current
  return normalizeBranch(patch.branch)
}

/**
 * The environment's compose after changing one service's branch override or
 * push-deploy switch.
 *
 * An override equal to what the project already says is removed rather than
 * written, and an overlay service that ends up carrying nothing but the markers
 * this function added is removed with it, so clearing every override leaves the
 * document as it was.
 */
export function patchEnvironmentSourceBinding(params: {
  projectCompose: unknown
  environmentCompose: unknown
  serviceName: string
  patch: EnvironmentSourcePatch
}): ComposeDocument {
  const { serviceName, patch } = params
  const merged = mergeComposeOverlay(params.projectCompose, params.environmentCompose)
  const inherited = mergeComposeOverlay(params.projectCompose, null)
  const mergedView = serviceView(servicesOf(merged)[serviceName])
  const inheritedView = serviceView(servicesOf(inherited)[serviceName])
  if (mergedView.sourceId === null) return normalizeCompose(params.environmentCompose)

  const document = normalizeCompose(params.environmentCompose)
  const services = cloneMapping(document.data.services)
  const service = cloneMapping(services[serviceName])
  const extension = cloneMapping(service[TURBOPANEL_SERVICE_EXTENSION_KEY])
  const source = cloneMapping(extension.source)

  applyOverride(
    source,
    'branch',
    nextBranchOverride(
      patch,
      normalizeBranch(typeof source.branch === 'string' ? source.branch : null)
    ),
    inheritedView.branch
  )
  if (patch.deployOnPush !== undefined) {
    // An explicit `true` is written only to undo an inherited opt-out.
    applyOverride(source, 'deployOnPush', patch.deployOnPush, inheritedView.deployOnPush)
  }

  const overridden = source.branch !== undefined || source.deployOnPush !== undefined
  if (overridden) {
    source.sourceId = mergedView.sourceId
    // The markers that let an overlay service save without an image.
    if (isHostNativeServiceKind(mergedView.kind)) extension.serviceKind = mergedView.kind
    else if (mergedView.railpack) source.buildKind = 'railpack'
    extension.source = source
    service[TURBOPANEL_SERVICE_EXTENSION_KEY] = extension
    services[serviceName] = service
  } else {
    stripAddedMarkers(services, serviceName, {
      service,
      extension,
      source,
      inheritedServiceKind: inheritedView.kind,
    })
  }

  return withServices(document, services)
}

const MARKER_SOURCE_KEYS = new Set(['sourceId', 'buildKind'])

/**
 * Take back what this function adds to carry an override: when nothing but those
 * markers is left in the overlay service they go too, so clearing every override
 * leaves the document as it was. A source block that holds other settings of the
 * operator's keeps its `sourceId`, and a `serviceKind` that differs from the
 * project's is a real override and stays.
 */
function stripAddedMarkers(
  services: Mapping,
  serviceName: string,
  parts: Readonly<{
    service: Mapping
    extension: Mapping
    source: Mapping
    inheritedServiceKind: ComposeServiceKind | undefined
  }>
): void {
  const { service, extension, source } = parts
  const onlyMarkers = Object.keys(source).every((key) => MARKER_SOURCE_KEYS.has(key))
  if (onlyMarkers) delete extension.source
  else extension.source = source
  const soleKey = Object.keys(extension).length === 1 && 'serviceKind' in extension
  // A kind equal to the project's is only the marker we wrote; a different one is a real override.
  if (soleKey && extension.serviceKind === parts.inheritedServiceKind) delete extension.serviceKind
  if (Object.keys(extension).length > 0) service[TURBOPANEL_SERVICE_EXTENSION_KEY] = extension
  else delete service[TURBOPANEL_SERVICE_EXTENSION_KEY]
  if (Object.keys(service).length > 0) services[serviceName] = service
  else delete services[serviceName]
}

function withServices(document: ComposeDocument, services: Mapping): ComposeDocument {
  const data: Mapping = { ...document.data }
  if (Object.keys(services).length > 0) data.services = services
  else delete data.services
  const keyOrder = document.presentation.keyOrder.filter((key) => key in data)
  if ('services' in data && !keyOrder.includes('services')) keyOrder.push('services')
  return {
    ...document,
    data,
    presentation: { ...document.presentation, keyOrder },
  }
}
