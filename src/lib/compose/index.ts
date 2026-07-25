export type {
  ComposeComment,
  ComposeDocument,
  ComposePresentation,
} from './types'
export {
  emptyComposeDocument,
  isBlankComposeData,
  isComposeDocument,
  isComposeEditorView,
  normalizeCompose,
  pruneBlankComposeData,
  type ComposeEditorView,
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
export type {
  ComposeServiceKind,
  ComposeServiceTurbopanelExtension,
  TraditionalWebEngine,
} from './service-kind'
export {
  isTraditionalWebComposeService,
  parseServiceTurbopanelExtension,
  readServiceTurbopanelExtension,
  TURBOPANEL_SERVICE_EXTENSION_KEY,
} from './service-kind'
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
  isBlankComposeData,
  isComposeEditorView,
  normalizeCompose,
  type ComposeComment,
  type ComposeDocument,
  type ComposeEditorView,
  type ComposePresentation,
} from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Preserve editor-only presentation metadata when rebuilding key order / comments. */
function clonePresentationMetadata(
  source: ComposePresentation,
): Pick<ComposePresentation, 'blankLines' | 'documentCommentBefore' | 'documentComment' | 'editorView'> {
  return {
    ...(source.blankLines ? { blankLines: { ...source.blankLines } } : {}),
    ...(typeof source.documentCommentBefore === 'string' &&
        source.documentCommentBefore.length > 0
      ? { documentCommentBefore: source.documentCommentBefore }
      : {}),
    ...(typeof source.documentComment === 'string' && source.documentComment.length > 0
      ? { documentComment: source.documentComment }
      : {}),
    ...(source.editorView ? { editorView: source.editorView } : {}),
  }
}

function buildPresentation(
  source: ComposePresentation,
  patch: {
    keyOrder: string[]
    comments: Record<string, ComposeComment>
  },
  editorView?: ComposeEditorView,
): ComposePresentation {
  const nextEditorView = editorView ?? source.editorView
  return {
    keyOrder: patch.keyOrder,
    comments: patch.comments,
    ...clonePresentationMetadata(source),
    ...(nextEditorView ? { editorView: nextEditorView } : {}),
  }
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
  if (isBlankComposeData(overlayDocument.data)) {
    return baseDocument
  }

  const data = deepMerge(baseDocument.data, overlayDocument.data)
  const editorView =
    overlayDocument.presentation.editorView ?? baseDocument.presentation.editorView
  return {
    version: 1,
    data,
    presentation: buildPresentation(
      baseDocument.presentation,
      {
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
      editorView,
    ),
  }
}

/** Mirror of instance `src/lib/compose/placement.ts`. */
export const TURBOPANEL_EXTENSION_KEY = 'x-turbopanel'

/** Compose Editor | Visual tab preference lives in `presentation.editorView` only. */
export type { ComposeEditorView } from './types'

export type ComposeTurbopanelExtension = {
  placement?: { server_id?: string }
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
    presentation: buildPresentation(normalized.presentation, {
      keyOrder,
      comments: { ...normalized.presentation.comments },
    }),
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
      presentation: buildPresentation(normalized.presentation, {
        keyOrder: keyOrder.filter((key) => key !== TURBOPANEL_EXTENSION_KEY),
        comments: { ...normalized.presentation.comments },
      }),
    }
  }

  data[TURBOPANEL_EXTENSION_KEY] = rest
  return {
    version: 1,
    data,
    presentation: buildPresentation(normalized.presentation, {
      keyOrder,
      comments: { ...normalized.presentation.comments },
    }),
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
  const normalized = normalizeCompose(document)
  return isComposeEditorView(normalized.presentation.editorView)
    ? normalized.presentation.editorView
    : null
}

export function setComposeEditorView(
  document: ComposeDocument,
  view: ComposeEditorView,
): ComposeDocument {
  const normalized = normalizeCompose(document)
  return {
    version: 1,
    data: { ...normalized.data },
    presentation: buildPresentation(
      normalized.presentation,
      {
        keyOrder: [...normalized.presentation.keyOrder],
        comments: { ...normalized.presentation.comments },
      },
      view,
    ),
  }
}

/** Drop legacy `x-turbopanel.view` from compose data when present in old saves. */
export function stripComposeEditorView(document: ComposeDocument): ComposeDocument {
  return normalizeCompose(document)
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
