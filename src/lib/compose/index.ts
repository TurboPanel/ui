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

export type ComposeTurbopanelExtension = {
  placement?: { server_id?: string }
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
  const data = { ...normalized.data }
  const keyOrder = [...normalized.presentation.keyOrder]

  if (!serverId) {
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

  const existing = isRecord(data[TURBOPANEL_EXTENSION_KEY])
    ? data[TURBOPANEL_EXTENSION_KEY]
    : {}
  const existingPlacement = isRecord(existing.placement) ? existing.placement : {}
  data[TURBOPANEL_EXTENSION_KEY] = {
    ...existing,
    placement: { ...existingPlacement, server_id: serverId },
  }
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

/**
 * Compose document for editor/preview UI: omit `x-turbopanel` placement.
 * Placement is managed via the project Server placement control, not YAML.
 */
export function stripComposePlacement(document: ComposeDocument): ComposeDocument {
  return setComposePlacementServerId(document, null)
}

/**
 * Re-apply placement from `source` onto `edited` so compose saves do not wipe a pin.
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
