/** Turns the create wizard's YAML text into the document `POST /projects` stores. */
import {
  ComposeParseError,
  emptyComposeDocument,
  normalizeCompose,
  yamlToComposeDocument,
  type ComposeDocument,
} from '@/lib/compose'

export type ComposeDraftResult =
  | { ok: true; document: ComposeDocument }
  | { ok: false; error: string }

/**
 * Blank text is legal — it yields the same empty compose a bare compose project
 * has always started with, so nobody is forced to author YAML to get past the
 * compose step.
 */
export function parseComposeDraft(yaml: string): ComposeDraftResult {
  if (!yaml.trim()) {
    return { ok: true, document: emptyComposeDocument() }
  }
  try {
    return { ok: true, document: normalizeCompose(yamlToComposeDocument(yaml)) }
  } catch (err) {
    if (err instanceof ComposeParseError) {
      return { ok: false, error: err.message }
    }
    return { ok: false, error: 'Compose YAML could not be parsed.' }
  }
}
