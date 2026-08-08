import {
  isBlankComposeData,
  isComposeEditorView,
  normalizeCompose,
  type ComposeComment,
  type ComposeDocument,
  type ComposeEditorView,
  type ComposePresentation,
} from './types'

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
export type {
  HostingPhpApplicability,
  HostingServiceContext,
  HostingWebEnvMode,
} from './hosting-service-context'
export {
  hostingDockerBridgeHint,
  hostingPathPrefixHint,
  hostingPhpSectionCopy,
  hostingServiceKindLabel,
  hostingWebEnvSectionCopy,
  resolveHostingServiceContext,
  shouldRevealOptionalHostingFields,
  traditionalWebEnvKeyForService,
} from './hosting-service-context'
export type { ComposeImageRef } from './image-ref'
export {
  emptyComposeImageRef,
  formatComposeImageRef,
  looksLikeRegistryHost,
  parseComposeImageRef,
  patchComposeImageRef,
} from './image-ref'
export type { ComposeBuildRef } from './build-ref'
export {
  DEFAULT_INLINE_DOCKERFILE,
  clearComposeBuildInline,
  dockerfileHasFromInstruction,
  emptyComposeBuildRef,
  parseComposeBuild,
  setComposeBuildInline,
} from './build-ref'
export type { ComposeOverlayState } from './overlay-state'
export { resolveComposeOverlayState } from './overlay-state'
export type {
  ComposeDocumentSummary,
  ComposeSummaryChip,
} from './summary'
export {
  formatComposeSummaryChips,
  summarizeComposeDocument,
} from './summary'
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

export type ComposeTurbopanelExtension = {
  placement?: { server_id?: string }
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

/**
 * Compose document for editor/preview UI: omit `x-turbopanel` placement.
 * Placement lives on `EnvironmentRecord.serverId`, never in compose. This is
 * an input-sanitization path only — it strips any placement a client might
 * still submit embedded in compose before it reaches the editor or save path.
 * Preserves any unrelated `x-turbopanel` fields.
 */
export function stripComposePlacement(document: ComposeDocument): ComposeDocument {
  return stripTurbopanelField(document, 'placement')
}

/**
 * Display-only: attach effective placement as top-level
 * `x-turbopanel.placement.server_id` for “what will actually run” YAML.
 * Does not persist — stored compose never carries placement (see
 * {@link stripComposePlacement}). When `serverId` is null/blank, placement is
 * omitted (other `x-turbopanel` fields preserved).
 */
export function withEffectivePlacement(
  document: ComposeDocument,
  serverId: string | null | undefined,
): ComposeDocument {
  const normalized = stripComposePlacement(document)
  const trimmed = typeof serverId === 'string' ? serverId.trim() : ''
  if (!trimmed) return normalized

  const existing = normalized.data[TURBOPANEL_EXTENSION_KEY]
  const rest = isRecord(existing) ? { ...existing } : {}
  const data = {
    ...normalized.data,
    [TURBOPANEL_EXTENSION_KEY]: {
      ...rest,
      placement: { server_id: trimmed },
    },
  }
  const keyOrder = [...normalized.presentation.keyOrder]
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

/**
 * Fields managed outside the YAML textarea: placement (Server control).
 * Editor view lives in `presentation.editorView` and is not part of compose YAML.
 */
export function stripComposeManagedExtension(
  document: ComposeDocument,
): ComposeDocument {
  return stripComposePlacement(document)
}

