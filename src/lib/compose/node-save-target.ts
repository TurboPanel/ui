import { emptyComposeDocument, mergeComposeOverlay } from '@/lib/compose'
import { makeComposeTag } from '@/lib/compose/tags'
import {
  patchServiceTurbopanelExtension,
  readServiceTurbopanelExtension,
  TURBOPANEL_SERVICE_EXTENSION_KEY,
  type ComposeServiceSourceExtension,
  type ComposeServiceTurbopanelExtensionPatch,
  type NodePackageManager,
} from '@/lib/compose/service-kind'
import type { ComposeDocument } from '@/lib/instance-api'

type Mapping = Record<string, unknown>

/** What the Node settings form holds. */
export type NodeSaveValues = Readonly<{
  enabled: boolean
  nodeVersion: string
  packageManager: string
  appMode: string
  documentRoot: string
  appRoot: string
  startupFile: string
}>

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

/** Extension patch for the Base: an explicit `undefined` clears a key back to its default. */
function extensionPatchFromValues(
  values: NodeSaveValues,
  source: ComposeServiceSourceExtension
): ComposeServiceTurbopanelExtensionPatch {
  const { subdirectory: _replaced, ...rest } = source
  return {
    enabled: values.enabled ? undefined : false,
    nodeVersion: values.nodeVersion || undefined,
    packageManager: (values.packageManager || undefined) as NodePackageManager | undefined,
    appMode: values.appMode === 'production' ? undefined : (values.appMode as 'development'),
    documentRoot: values.documentRoot || undefined,
    startupFile: values.startupFile || undefined,
    source: values.appRoot.length === 0 ? rest : { ...rest, subdirectory: values.appRoot },
  }
}

type FieldName =
  'nodeVersion' | 'packageManager' | 'documentRoot' | 'startupFile' | 'appMode' | 'enabled'

const LABELS: Readonly<Record<FieldName | 'appRoot', string>> = {
  nodeVersion: 'The Node version',
  packageManager: 'The package manager',
  documentRoot: 'The document root',
  startupFile: 'The startup file',
  appMode: 'The mode',
  enabled: 'Start after deploy',
  appRoot: 'The app folder',
}

/**
 * Settings an environment cannot leave empty over a Base value. The control
 * plane accepts no way to clear these in an environment's own changes, so the
 * form refuses the save and says what to do instead of losing the edit.
 */
export function nodeValuesThatCannotBeCleared(
  values: NodeSaveValues,
  projectCompose: ComposeDocument | null | undefined,
  serviceName: string
): string[] {
  const entry = servicesOf(projectCompose)[serviceName]
  const base = isMapping(entry) ? readServiceTurbopanelExtension(entry) : null
  if (base === null) return []
  const out: string[] = []
  if (values.nodeVersion === '' && base.nodeVersion) out.push(LABELS.nodeVersion)
  if (values.packageManager === '' && base.packageManager) out.push(LABELS.packageManager)
  if (values.appRoot === '' && base.source?.subdirectory) out.push(LABELS.appRoot)
  return out
}

/** One text field of the environment's changes: inherit, set, or reset over a Base value. */
function applyTextField(
  ext: Mapping,
  field: 'documentRoot' | 'startupFile',
  want: string,
  base: string
) {
  if (want === base) delete ext[field]
  else if (want !== '') ext[field] = want
  else ext[field] = makeComposeTag('reset', null)
}

function environmentEntry(
  own: Mapping,
  values: NodeSaveValues,
  baseExt: ReturnType<typeof readServiceTurbopanelExtension>,
  effective: unknown
): Mapping | null {
  const merged = isMapping(effective) ? readServiceTurbopanelExtension(effective) : null
  const ext: Mapping = isMapping(own[TURBOPANEL_SERVICE_EXTENSION_KEY])
    ? { ...(own[TURBOPANEL_SERVICE_EXTENSION_KEY] as Mapping) }
    : {}
  if (merged?.serviceKind !== undefined) ext.serviceKind = merged.serviceKind

  const same = (want: unknown, base: unknown) => want === base
  const setOrInherit = (field: 'nodeVersion' | 'packageManager', want: string, base: string) => {
    if (same(want, base) || want === '') delete ext[field]
    else ext[field] = want
  }
  setOrInherit('nodeVersion', values.nodeVersion, baseExt?.nodeVersion ?? '')
  setOrInherit('packageManager', values.packageManager, baseExt?.packageManager ?? '')
  applyTextField(ext, 'documentRoot', values.documentRoot, baseExt?.documentRoot ?? '')
  applyTextField(ext, 'startupFile', values.startupFile, baseExt?.startupFile ?? '')

  const baseMode = baseExt?.appMode ?? 'production'
  if (values.appMode === baseMode) delete ext.appMode
  else ext.appMode = values.appMode

  const baseEnabled = baseExt?.enabled ?? true
  if (values.enabled === baseEnabled) delete ext.enabled
  else ext.enabled = values.enabled

  // Only the app folder is ever written into the source, plus the id that lets
  // it save; the branch and the rest keep coming from the Base.
  const ownSource = isMapping(ext.source) ? { ...(ext.source as Mapping) } : {}
  const baseFolder = baseExt?.source?.subdirectory ?? ''
  if (values.appRoot === baseFolder) delete ownSource.subdirectory
  else ownSource.subdirectory = values.appRoot
  const keepsSource = Object.keys(ownSource).some(
    (key) => key !== 'sourceId' && key !== 'buildKind'
  )
  if (keepsSource) {
    const sourceId = merged?.source?.sourceId
    if (sourceId !== undefined) ownSource.sourceId = sourceId
    ext.source = ownSource
  } else {
    delete ext.source
  }

  const meaningful = Object.keys(ext).some((key) => key !== 'serviceKind')
  if (!meaningful) {
    // Nothing differs from the Base: no entry at all, or just the keys the
    // environment already had, with the marker that lets them save.
    const { [TURBOPANEL_SERVICE_EXTENSION_KEY]: _none, ...rest } = own
    if (Object.keys(rest).length === 0) return null
    return { ...rest, [TURBOPANEL_SERVICE_EXTENSION_KEY]: ext }
  }
  return { ...own, [TURBOPANEL_SERVICE_EXTENSION_KEY]: ext }
}

export type NodeSaveResult =
  | Readonly<{ ok: true; target: 'environment' | 'project'; compose: ComposeDocument }>
  | Readonly<{ ok: false; reason: string }>

/**
 * The compose document a Node settings save writes, and which one it goes to.
 *
 * Seen from an environment, a save always lands in that environment, even when
 * the Base defines the service: the environment gets an entry holding only the
 * keys that differ from the Base (plus the `serviceKind` marker that lets it
 * save without an image), layered over the Base. Only a view with no
 * environment edits the Base. A save from an environment whose own document has
 * not loaded is refused, so it can never replace the environment's changes.
 */
export function composeForNodeSave(
  input: Readonly<{
    environmentId: string | null
    projectCompose: ComposeDocument | null | undefined
    environmentCompose: ComposeDocument | null | undefined
    /** The environment record has loaded; a save never builds on a guess. */
    environmentReady: boolean
    serviceName: string
    /** The service with the Base and the environment merged. */
    effective: unknown
    values: NodeSaveValues
    /** The merged source binding, kept whole when the Base itself is edited. */
    source: ComposeServiceSourceExtension
  }>
): NodeSaveResult {
  const toEnvironment = input.environmentId !== null && input.environmentId !== ''
  if (!toEnvironment) {
    const document = input.projectCompose ?? emptyComposeDocument()
    const services = servicesOf(document)
    const current = isMapping(services[input.serviceName])
      ? (services[input.serviceName] as Mapping)
      : {}
    services[input.serviceName] = patchServiceTurbopanelExtension(
      current,
      extensionPatchFromValues(input.values, input.source)
    )
    return {
      ok: true,
      target: 'project',
      compose: { ...document, data: { ...document.data, services } },
    }
  }
  if (!input.environmentReady) {
    return { ok: false, reason: 'This environment has not loaded yet. Try again in a moment.' }
  }
  const blocked = nodeValuesThatCannotBeCleared(
    input.values,
    input.projectCompose,
    input.serviceName
  )
  if (blocked.length > 0) {
    return {
      ok: false,
      reason: `${blocked.join(' and ')} comes from the Base, so an environment cannot leave it empty. Pick a value, or change it in the Base.`,
    }
  }
  const document = input.environmentCompose ?? emptyComposeDocument()
  const services = servicesOf(document)
  const own = isMapping(services[input.serviceName]) ? (services[input.serviceName] as Mapping) : {}
  const baseExt = readServiceTurbopanelExtension(
    (servicesOf(input.projectCompose)[input.serviceName] ?? {}) as Mapping
  )
  const entry = environmentEntry(own, input.values, baseExt, input.effective)
  if (entry === null) delete services[input.serviceName]
  else services[input.serviceName] = entry
  return {
    ok: true,
    target: 'environment',
    compose: { ...document, data: { ...document.data, services } },
  }
}
