/**
 * Hide/restore TurboPanel `x-turbopanel` metadata for the compose YAML surface.
 *
 * Stored compose keeps the full document (top-level + per-service extension).
 * The YAML editor and read-only previews show native Docker Compose only; the
 * Services form edits extension fields and the shadow re-attaches them on parse.
 */

import {
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

/**
 * Remove every `x-turbopanel` node (top-level and per-service) plus matching
 * presentation entries into a shadow. Service keys stay even when empty
 * (traditional-web often has no other compose fields).
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

  if (TURBOPANEL_EXTENSION_KEY in data) {
    hidden.root = deepCopy(data[TURBOPANEL_EXTENSION_KEY])
    delete data[TURBOPANEL_EXTENSION_KEY]
  }

  const servicesValue = data.services
  if (isRecord(servicesValue)) {
    const nextServices: Record<string, unknown> = {}
    for (const [name, serviceValue] of Object.entries(servicesValue)) {
      if (!isRecord(serviceValue)) {
        nextServices[name] = serviceValue
        continue
      }
      if (TURBOPANEL_SERVICE_EXTENSION_KEY in serviceValue) {
        hidden.services[name] = deepCopy(
          serviceValue[TURBOPANEL_SERVICE_EXTENSION_KEY],
        )
        const {
          [TURBOPANEL_SERVICE_EXTENSION_KEY]: _removed,
          ...rest
        } = serviceValue
        nextServices[name] = rest
      } else {
        nextServices[name] = serviceValue
      }
    }
    data.services = nextServices
  }

  const comments: Record<string, ComposeComment> = {}
  for (const [path, comment] of Object.entries(normalized.presentation.comments)) {
    if (isManagedExtensionPresentationPath(path)) {
      hidden.comments[path] = { ...comment }
    } else {
      comments[path] = comment
    }
  }

  const blankLines: Record<string, number> = {}
  for (const [path, count] of Object.entries(
    normalized.presentation.blankLines ?? {},
  )) {
    if (isManagedExtensionPresentationPath(path)) {
      hidden.blankLines[path] = count
    } else {
      blankLines[path] = count
    }
  }

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

  if (hidden.root !== undefined) {
    data[TURBOPANEL_EXTENSION_KEY] = deepCopy(hidden.root)
    if (!keyOrder.includes(TURBOPANEL_EXTENSION_KEY)) {
      keyOrder.push(TURBOPANEL_EXTENSION_KEY)
    }
  } else {
    delete data[TURBOPANEL_EXTENSION_KEY]
    const extIndex = keyOrder.indexOf(TURBOPANEL_EXTENSION_KEY)
    if (extIndex >= 0) {
      keyOrder.splice(extIndex, 1)
    }
  }

  const servicesValue = data.services
  if (isRecord(servicesValue)) {
    const nextServices: Record<string, unknown> = {}
    for (const [name, serviceValue] of Object.entries(servicesValue)) {
      if (!isRecord(serviceValue)) {
        nextServices[name] = serviceValue
        continue
      }
      const {
        [TURBOPANEL_SERVICE_EXTENSION_KEY]: _authorTyped,
        ...rest
      } = serviceValue
      if (Object.hasOwn(hidden.services, name)) {
        nextServices[name] = {
          ...rest,
          [TURBOPANEL_SERVICE_EXTENSION_KEY]: deepCopy(hidden.services[name]),
        }
      } else {
        nextServices[name] = rest
      }
    }
    data.services = nextServices
  }

  const comments: Record<string, ComposeComment> = {}
  for (const [path, comment] of Object.entries(normalized.presentation.comments)) {
    if (!isManagedExtensionPresentationPath(path)) {
      comments[path] = comment
    }
  }
  for (const [path, comment] of Object.entries(hidden.comments)) {
    comments[path] = { ...comment }
  }

  const blankLines: Record<string, number> = {}
  for (const [path, count] of Object.entries(
    normalized.presentation.blankLines ?? {},
  )) {
    if (!isManagedExtensionPresentationPath(path)) {
      blankLines[path] = count
    }
  }
  for (const [path, count] of Object.entries(hidden.blankLines)) {
    blankLines[path] = count
  }

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
 * Service names whose stashed extension is `serviceKind: traditional-web`.
 * Used by the UI linter when the visible YAML no longer carries that field.
 */
export function hiddenTraditionalWebServiceNames(
  hidden: ComposeHiddenExtensions,
): string[] {
  const names: string[] = []
  for (const [name, raw] of Object.entries(hidden.services)) {
    const parsed = parseServiceTurbopanelExtension(raw)
    if (parsed?.serviceKind === 'traditional-web') {
      names.push(name)
    }
  }
  return names.sort((a, b) => a.localeCompare(b))
}
