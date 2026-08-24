/**
 * Hide/restore TurboPanel `x-turbopanel` metadata for the compose YAML surface.
 *
 * Stored compose keeps the full document (top-level + per-service extension).
 * The YAML editor and read-only previews show native Docker Compose only; the
 * Services form edits extension fields and the shadow re-attaches them on parse.
 */

import {
  isHostNativeServiceKind,
  parseServiceTurbopanelExtension,
  TURBOPANEL_SERVICE_EXTENSION_KEY,
} from './service-kind'
import {
  normalizeCompose,
  type ComposeComment,
  type ComposeDocument,
  type ComposePresentation,
} from './types'

/** Same token as top-level / per-service `x-turbopanel` (keep free of `./index` imports). */
const TURBOPANEL_EXTENSION_KEY = 'x-turbopanel'

/** Stashed `x-turbopanel` nodes + presentation entries removed for the YAML surface. */
export type ComposeHiddenExtensions = {
  root?: unknown
  services: Record<string, unknown>
  comments: Record<string, ComposeComment>
  blankLines: Record<string, number>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deepCopy<T>(value: T): T {
  return structuredClone(value)
}

/**
 * True when a presentation path (comment / blank-line key) equals or nests under
 * a removed `x-turbopanel` node, including `#key` blank-line paths from convert.
 */
function isManagedExtensionPresentationPath(path: string): boolean {
  const base = path.endsWith('#key') ? path.slice(0, -4) : path
  if (base === TURBOPANEL_EXTENSION_KEY) return true
  if (base.startsWith(`${TURBOPANEL_EXTENSION_KEY}.`)) return true

  const servicesPrefix = 'services.'
  if (!base.startsWith(servicesPrefix)) return false
  const afterServices = base.slice(servicesPrefix.length)
  const nameDot = afterServices.indexOf('.')
  if (nameDot < 0) return false
  const afterName = afterServices.slice(nameDot + 1)
  if (afterName === TURBOPANEL_SERVICE_EXTENSION_KEY) return true
  return afterName.startsWith(`${TURBOPANEL_SERVICE_EXTENSION_KEY}.`)
}

function clonePresentationShell(
  source: ComposePresentation,
  patch: {
    keyOrder: string[]
    comments: Record<string, ComposeComment>
    blankLines?: Record<string, number>
  },
): ComposePresentation {
  return {
    keyOrder: patch.keyOrder,
    comments: patch.comments,
    ...(patch.blankLines && Object.keys(patch.blankLines).length > 0
      ? { blankLines: patch.blankLines }
      : {}),
    ...(typeof source.documentCommentBefore === 'string' &&
        source.documentCommentBefore.length > 0
      ? { documentCommentBefore: source.documentCommentBefore }
      : {}),
    ...(typeof source.documentComment === 'string' &&
        source.documentComment.length > 0
      ? { documentComment: source.documentComment }
      : {}),
    ...(source.editorView ? { editorView: source.editorView } : {}),
  }
}

function withoutServiceExtension(
  service: Record<string, unknown>,
): Record<string, unknown> {
  const { [TURBOPANEL_SERVICE_EXTENSION_KEY]: _removed, ...rest } = service
  return rest
}

function stashRootExtension(
  data: Record<string, unknown>,
  hidden: ComposeHiddenExtensions,
): void {
  if (!(TURBOPANEL_EXTENSION_KEY in data)) return
  hidden.root = deepCopy(data[TURBOPANEL_EXTENSION_KEY])
  delete data[TURBOPANEL_EXTENSION_KEY]
}

function stashVisibleService(
  name: string,
  serviceValue: unknown,
  hidden: ComposeHiddenExtensions,
): unknown {
  if (!isRecord(serviceValue)) return serviceValue
  if (!(TURBOPANEL_SERVICE_EXTENSION_KEY in serviceValue)) return serviceValue
  hidden.services[name] = deepCopy(
    serviceValue[TURBOPANEL_SERVICE_EXTENSION_KEY],
  )
  return withoutServiceExtension(serviceValue)
}

function stashServiceExtensions(
  data: Record<string, unknown>,
  hidden: ComposeHiddenExtensions,
): void {
  const servicesValue = data.services
  if (!isRecord(servicesValue)) return
  const nextServices: Record<string, unknown> = {}
  for (const [name, serviceValue] of Object.entries(servicesValue)) {
    nextServices[name] = stashVisibleService(name, serviceValue, hidden)
  }
  data.services = nextServices
}

function takeManagedPresentation<T>(
  source: Record<string, T>,
  into: Record<string, T>,
  copy: (value: T) => T,
): Record<string, T> {
  const kept: Record<string, T> = {}
  for (const [path, value] of Object.entries(source)) {
    if (isManagedExtensionPresentationPath(path)) {
      into[path] = copy(value)
    } else {
      kept[path] = value
    }
  }
  return kept
}

function applyHiddenRoot(
  data: Record<string, unknown>,
  keyOrder: string[],
  root: unknown,
): void {
  if (root !== undefined) {
    data[TURBOPANEL_EXTENSION_KEY] = deepCopy(root)
    if (!keyOrder.includes(TURBOPANEL_EXTENSION_KEY)) {
      keyOrder.push(TURBOPANEL_EXTENSION_KEY)
    }
    return
  }
  delete data[TURBOPANEL_EXTENSION_KEY]
  const extIndex = keyOrder.indexOf(TURBOPANEL_EXTENSION_KEY)
  if (extIndex >= 0) {
    keyOrder.splice(extIndex, 1)
  }
}

function restoreVisibleService(
  name: string,
  serviceValue: unknown,
  hiddenServices: Record<string, unknown>,
): unknown {
  if (!isRecord(serviceValue)) return serviceValue
  const rest = withoutServiceExtension(serviceValue)
  if (!Object.hasOwn(hiddenServices, name)) return rest
  return {
    ...rest,
    [TURBOPANEL_SERVICE_EXTENSION_KEY]: deepCopy(hiddenServices[name]),
  }
}

function restoreServiceExtensions(
  data: Record<string, unknown>,
  hiddenServices: Record<string, unknown>,
): void {
  const servicesValue = data.services
  if (!isRecord(servicesValue)) return
  const nextServices: Record<string, unknown> = {}
  for (const [name, serviceValue] of Object.entries(servicesValue)) {
    nextServices[name] = restoreVisibleService(name, serviceValue, hiddenServices)
  }
  data.services = nextServices
}

function overlayHiddenPresentation<T>(
  visible: Record<string, T>,
  hidden: Record<string, T>,
  copy: (value: T) => T,
): Record<string, T> {
  const next: Record<string, T> = {}
  for (const [path, value] of Object.entries(visible)) {
    if (isManagedExtensionPresentationPath(path)) continue
    next[path] = value
  }
  for (const [path, value] of Object.entries(hidden)) {
    next[path] = copy(value)
  }
  return next
}

/**
 * Remove every `x-turbopanel` node (top-level and per-service) plus matching
 * presentation entries into a shadow. Service keys stay even when empty
 * (site often has no other compose fields).
 */
export function hideComposeTurbopanelExtensions(
  document: ComposeDocument,
): { document: ComposeDocument; hidden: ComposeHiddenExtensions } {
  const normalized = normalizeCompose(document)
  const data = { ...normalized.data }
  const hidden: ComposeHiddenExtensions = {
    services: {},
    comments: {},
    blankLines: {},
  }

  stashRootExtension(data, hidden)
  stashServiceExtensions(data, hidden)

  const comments = takeManagedPresentation(
    normalized.presentation.comments,
    hidden.comments,
    (comment) => ({ ...comment }),
  )
  const blankLines = takeManagedPresentation(
    normalized.presentation.blankLines ?? {},
    hidden.blankLines,
    (count) => count,
  )
  const keyOrder = normalized.presentation.keyOrder.filter(
    (key) => key !== TURBOPANEL_EXTENSION_KEY,
  )

  return {
    document: {
      version: 1,
      data,
      presentation: clonePresentationShell(normalized.presentation, {
        keyOrder,
        comments,
        blankLines,
      }),
    },
    hidden,
  }
}

/**
 * Re-attach stashed extensions onto a visible (author-facing) document.
 * Extensions for services the author deleted/renamed in YAML are dropped.
 * Platform shadow wins over any `x-turbopanel` typed into the YAML.
 */
export function restoreComposeTurbopanelExtensions(
  visible: ComposeDocument,
  hidden: ComposeHiddenExtensions,
): ComposeDocument {
  const normalized = normalizeCompose(visible)
  const data = { ...normalized.data }
  const keyOrder = [...normalized.presentation.keyOrder]

  applyHiddenRoot(data, keyOrder, hidden.root)
  restoreServiceExtensions(data, hidden.services)

  const comments = overlayHiddenPresentation(
    normalized.presentation.comments,
    hidden.comments,
    (comment) => ({ ...comment }),
  )
  const blankLines = overlayHiddenPresentation(
    normalized.presentation.blankLines ?? {},
    hidden.blankLines,
    (count) => count,
  )

  return {
    version: 1,
    data,
    presentation: clonePresentationShell(normalized.presentation, {
      keyOrder,
      comments,
      blankLines,
    }),
  }
}

/**
 * Service names whose stashed extension declares a **host-native** kind
 * (`site` or `node`). Used by the UI linter when the visible YAML no
 * longer carries `serviceKind`: neither kind declares `image`/`build`, so
 * without this list the hidden extension would make the editor flag every one
 * of them.
 */
export function hiddenSiteServiceNames(
  hidden: ComposeHiddenExtensions,
): string[] {
  const names: string[] = []
  for (const [name, raw] of Object.entries(hidden.services)) {
    const parsed = parseServiceTurbopanelExtension(raw)
    if (isHostNativeServiceKind(parsed?.serviceKind)) {
      names.push(name)
    }
  }
  return names.sort((a, b) => a.localeCompare(b))
}
