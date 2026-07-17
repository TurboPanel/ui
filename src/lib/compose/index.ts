export type {
  ComposeComment,
  ComposeDocument,
  ComposePresentation,
} from './types'
export {
  emptyComposeDocument,
  isComposeDocument,
  normalizeCompose,
} from './types'
export {
  ComposeParseError,
  composeDocumentToRuntimeYaml,
  composeDocumentToYaml,
  yamlToComposeDocument,
} from './convert'
export type { ComposeLintIssue, ComposeLintLevel } from './lint'
export {
  blockingComposeLintIssues,
  isComposeServicePropertyKey,
  isComposeTopLevelKey,
  lintComposeYaml,
} from './lint'
export type { ComposeImageRef } from './image-ref'
export {
  emptyComposeImageRef,
  formatComposeImageRef,
  looksLikeRegistryHost,
  parseComposeImageRef,
  patchComposeImageRef,
} from './image-ref'
export type {
  ComposeRestartPolicy,
  ParsedComposeRestart,
  VisualFieldDef,
  VisualFieldId,
} from './visual-fields'
export {
  COMPOSE_RESTART_POLICIES,
  VISUAL_SERVICE_FIELDS,
  addableVisualFields,
  formatComposeRestart,
  isComposeRestartPolicy,
  parseComposeRestart,
  serviceHasVisualField,
  visualFieldById,
} from './visual-fields'

import {
  normalizeCompose,
  type ComposeDocument,
} from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deepMerge(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...base }
  for (const [key, value] of Object.entries(overlay)) {
    const existing = merged[key]
    merged[key] = isRecord(existing) && isRecord(value)
      ? deepMerge(existing, value)
      : value
  }
  return merged
}

export function mergeComposeOverlay(
  base: unknown,
  overlay: unknown,
): ComposeDocument {
  const baseDocument = normalizeCompose(base)
  const overlayDocument = normalizeCompose(overlay)
  const overlayKeys = Object.keys(overlayDocument.data)
  const overlayIsEmpty = overlayKeys.length === 0 ||
    (overlayKeys.length === 1 &&
      isRecord(overlayDocument.data.services) &&
      Object.keys(overlayDocument.data.services).length === 0)

  if (overlayIsEmpty) {
    return baseDocument
  }

  const data = deepMerge(baseDocument.data, overlayDocument.data)
  return {
    version: 1,
    data,
    presentation: {
      keyOrder: [...new Set([
        ...baseDocument.presentation.keyOrder,
        ...overlayDocument.presentation.keyOrder,
        ...Object.keys(data),
      ])],
      comments: {
        ...baseDocument.presentation.comments,
        ...overlayDocument.presentation.comments,
      },
    },
  }
}

/** Mirror of instance `src/lib/compose/placement.ts`. */
export const TURBOPANEL_EXTENSION_KEY = 'x-turbopanel'

/** Compose Editor | Visual tab preference stored under `x-turbopanel.view`. */
export type ComposeEditorView = 'editor' | 'visual'

export type ComposeTurbopanelExtension = {
  placement?: { server_id?: string }
  view?: ComposeEditorView
}

export function isComposeEditorView(value: unknown): value is ComposeEditorView {
  return value === 'editor' || value === 'visual'
}

function withTurbopanelExtension(
  document: ComposeDocument,
  extension: Record<string, unknown>,
): ComposeDocument {
  const normalized = normalizeCompose(document)
  const data = { ...normalized.data }
  const keyOrder = [...normalized.presentation.keyOrder]
  data[TURBOPANEL_EXTENSION_KEY] = extension
  if (!keyOrder.includes(TURBOPANEL_EXTENSION_KEY)) {
    keyOrder.push(TURBOPANEL_EXTENSION_KEY)
  }
  return {
    version: 1,
    data,
    presentation: {
      keyOrder,
      comments: { ...normalized.presentation.comments },
      ...(normalized.presentation.blankLines
        ? { blankLines: { ...normalized.presentation.blankLines } }
        : {}),
    },
  }
}

function stripTurbopanelField(
  document: ComposeDocument,
  field: string,
): ComposeDocument {
  const normalized = normalizeCompose(document)
  const extension = normalized.data[TURBOPANEL_EXTENSION_KEY]
  if (!isRecord(extension) || !(field in extension)) {
    return normalized
  }

  const { [field]: _removed, ...rest } = extension
  const data = { ...normalized.data }
  const keyOrder = [...normalized.presentation.keyOrder]

  if (Object.keys(rest).length === 0) {
    delete data[TURBOPANEL_EXTENSION_KEY]
    return {
      version: 1,
      data,
      presentation: {
        keyOrder: keyOrder.filter((key) => key !== TURBOPANEL_EXTENSION_KEY),
        comments: { ...normalized.presentation.comments },
        ...(normalized.presentation.blankLines
          ? { blankLines: { ...normalized.presentation.blankLines } }
          : {}),
      },
    }
  }

  data[TURBOPANEL_EXTENSION_KEY] = rest
  return {
    version: 1,
    data,
    presentation: {
      keyOrder,
      comments: { ...normalized.presentation.comments },
      ...(normalized.presentation.blankLines
        ? { blankLines: { ...normalized.presentation.blankLines } }
        : {}),
    },
  }
}

export function readComposePlacementServerId(
  document: ComposeDocument,
): string | null {
  const extension = document.data[TURBOPANEL_EXTENSION_KEY]
  if (!isRecord(extension)) return null
  const placement = extension.placement
  if (!isRecord(placement)) return null
  const serverId = placement.server_id
  if (typeof serverId !== 'string') return null
  const trimmed = serverId.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function setComposePlacementServerId(
  document: ComposeDocument,
  serverId: string | null,
): ComposeDocument {
  const normalized = normalizeCompose(document)

  if (!serverId) {
    return stripComposePlacement(normalized)
  }

  const existing = isRecord(normalized.data[TURBOPANEL_EXTENSION_KEY])
    ? normalized.data[TURBOPANEL_EXTENSION_KEY]
    : {}
  const existingPlacement = isRecord(existing.placement) ? existing.placement : {}
  return withTurbopanelExtension(normalized, {
    ...existing,
    placement: { ...existingPlacement, server_id: serverId },
  })
}

/**
 * Compose document for editor/preview UI: omit `x-turbopanel` placement.
 * Placement is managed via the environment Server placement control, not YAML.
 * Preserves any unrelated `x-turbopanel` fields.
 */
export function stripComposePlacement(document: ComposeDocument): ComposeDocument {
  return stripTurbopanelField(document, 'placement')
}

export function readComposeEditorView(
  document: ComposeDocument,
): ComposeEditorView | null {
  const extension = document.data[TURBOPANEL_EXTENSION_KEY]
  if (!isRecord(extension)) return null
  return isComposeEditorView(extension.view) ? extension.view : null
}

export function setComposeEditorView(
  document: ComposeDocument,
  view: ComposeEditorView,
): ComposeDocument {
  const normalized = normalizeCompose(document)
  const existing = isRecord(normalized.data[TURBOPANEL_EXTENSION_KEY])
    ? normalized.data[TURBOPANEL_EXTENSION_KEY]
    : {}
  return withTurbopanelExtension(normalized, { ...existing, view })
}

/** Hide `x-turbopanel.view` from the YAML editor (managed by Editor/Visual tabs). */
export function stripComposeEditorView(document: ComposeDocument): ComposeDocument {
  return stripTurbopanelField(document, 'view')
}

/**
 * Fields managed outside the YAML textarea: placement (Server control) and
 * editor view (Editor/Visual tabs).
 */
export function stripComposeManagedExtension(
  document: ComposeDocument,
): ComposeDocument {
  return stripComposeEditorView(stripComposePlacement(document))
}

/**
 * Re-apply placement from `source` onto `edited` so environment compose saves
 * do not wipe a pin managed outside the YAML editor.
 */
export function preserveComposePlacement(
  edited: ComposeDocument,
  source: unknown,
): ComposeDocument {
  return setComposePlacementServerId(
    edited,
    readComposePlacementServerId(normalizeCompose(source)),
  )
}
