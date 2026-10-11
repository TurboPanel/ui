/**
 * The saved compose of an environment that stands alone. Kept in its own file
 * because the compose tag name is syntax, not copy (the vocabulary test skips
 * this file, as it skips `follows-base.ts`).
 */

import { makeComposeTag } from '@/lib/compose/tags'
import { emptyComposeDocument, type ComposeDocument } from '@/lib/compose/types'

/**
 * The saved compose of an environment that stands alone: its own `services`
 * block replaces the Base's (`services: !override {}`), which is how a deploy
 * decides the Base no longer reaches it.
 */
export function standAloneCompose(): ComposeDocument {
  const empty = emptyComposeDocument()
  return {
    ...empty,
    data: { services: makeComposeTag('override', {}) },
    presentation: { ...empty.presentation, keyOrder: ['services'] },
  }
}
