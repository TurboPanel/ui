import { parseDocument, stringify } from 'yaml'

export type ComposeDocument = {
  version: 1
  data: Record<string, unknown>
  presentation: {
    keyOrder: string[]
    comments: Record<string, { before?: string; inline?: string }>
    blankLines?: Record<string, number>
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function emptyComposeDocument(): ComposeDocument {
  return {
    version: 1,
    data: { services: {} },
    presentation: { keyOrder: ['services'], comments: {} },
  }
}

export function normalizeCompose(value: unknown): ComposeDocument {
  if (!isRecord(value)) {
    return emptyComposeDocument()
  }

  if (value.version === 1 && isRecord(value.data) && isRecord(value.presentation)) {
    const presentation = value.presentation
    return {
      version: 1,
      data: { ...value.data },
      presentation: {
        keyOrder: Array.isArray(presentation.keyOrder)
          ? presentation.keyOrder.filter((key): key is string => typeof key === 'string')
          : Object.keys(value.data),
        comments: isRecord(presentation.comments)
          ? presentation.comments as ComposeDocument['presentation']['comments']
          : {},
        ...(isRecord(presentation.blankLines)
          ? { blankLines: presentation.blankLines as Record<string, number> }
          : {}),
      },
    }
  }

  return {
    version: 1,
    data: { ...value },
    presentation: { keyOrder: Object.keys(value), comments: {} },
  }
}

export function yamlToComposeDocument(source: string): ComposeDocument {
  if (!source.trim()) {
    return emptyComposeDocument()
  }

  const document = parseDocument(source, { prettyErrors: true })
  if (document.errors.length > 0) {
    throw new Error(document.errors.map((error) => error.message).join('; '))
  }

  const value = document.toJSON()
  if (!isRecord(value)) {
    throw new Error('Compose file root must be a mapping')
  }

  return {
    version: 1,
    data: value,
    presentation: { keyOrder: Object.keys(value), comments: {} },
  }
}

export function composeDocumentToYaml(value: unknown): string {
  const document = normalizeCompose(value)
  const yaml = stringify(document.data, { lineWidth: 0 })
  return yaml.endsWith('\n') ? yaml : `${yaml}\n`
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
  const overlayIsEmpty = Object.keys(overlayDocument.data).length === 1 &&
    isRecord(overlayDocument.data.services) &&
    Object.keys(overlayDocument.data.services).length === 0

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
