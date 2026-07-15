/** Versioned Docker Compose document stored in project/environment `options.compose`. */

export type ComposeComment = {
  /** commentBefore on the value node (e.g. `#` lines before nested map children). */
  before?: string
  /** Trailing `#` on the value scalar (e.g. `image: nginx:alpine # line comment`). */
  inline?: string
  /**
   * commentBefore on the mapping key. Kept separate from {@link before} so key and
   * value comments at the same path never overwrite each other on round-trip.
   */
  keyBefore?: string
  /** Trailing `#` on the mapping key. */
  keyInline?: string
}

export type ComposePresentation = {
  /** Top-level mapping key order (e.g. services before networks). */
  keyOrder: string[]
  /** Path (dot-joined) → comments attached to that node. */
  comments: Record<string, ComposeComment>
  /** Path → number of blank lines before the node. */
  blankLines?: Record<string, number>
  /**
   * Leading `#` lines on the Document when separated from the root mapping by
   * a blank line (yaml attaches those to `Document.commentBefore`, not the
   * first key). Without a blank line, leading comments land on the first key
   * as {@link ComposeComment.keyBefore} instead.
   */
  documentCommentBefore?: string
  /** Trailing `#` lines after the document root (`Document.comment`). */
  documentComment?: string
}

export type ComposeDocument = {
  version: 1
  /** Compose tree as JSON (`services`, `networks`, …). */
  data: Record<string, unknown>
  /** Editor presentation only — stripped for runtime deploy. */
  presentation: ComposePresentation
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function emptyComposeDocument(): ComposeDocument {
  return {
    version: 1,
    data: {},
    presentation: { keyOrder: [], comments: {} },
  }
}

export function isComposeDocument(value: unknown): value is ComposeDocument {
  if (!isRecord(value)) return false
  if (value.version !== 1) return false
  if (!isRecord(value.data)) return false
  if (!isRecord(value.presentation)) return false
  const presentation = value.presentation
  return Array.isArray(presentation.keyOrder) && isRecord(presentation.comments)
}

/**
 * Normalize a valid ComposeDocument, or an intentionally empty value (`null` /
 * `undefined`). Does not lift bare compose objects into the current format.
 */
export function normalizeCompose(value: unknown): ComposeDocument {
  if (value == null) return emptyComposeDocument()
  if (!isComposeDocument(value)) return emptyComposeDocument()

  const presentation = value.presentation
  return {
    version: 1,
    data: { ...value.data },
    presentation: {
      keyOrder: presentation.keyOrder.filter((key): key is string => typeof key === 'string'),
      comments: { ...presentation.comments },
      ...(isRecord(presentation.blankLines)
        ? { blankLines: presentation.blankLines as Record<string, number> }
        : {}),
      ...(typeof presentation.documentCommentBefore === 'string' &&
          presentation.documentCommentBefore.length > 0
        ? { documentCommentBefore: presentation.documentCommentBefore }
        : {}),
      ...(typeof presentation.documentComment === 'string' &&
          presentation.documentComment.length > 0
        ? { documentComment: presentation.documentComment }
        : {}),
    },
  }
}
