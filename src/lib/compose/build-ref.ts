/**
 * Split / join Compose `build:` values for the Visual editor.
 *
 * Compose accepts either a string shorthand (`build: .`) or a mapping with
 * `context`, `dockerfile`, `dockerfile_inline`, `args`, `target`, etc.
 * Visual edit support focuses on the inline Dockerfile form
 * (`context: .` + `dockerfile_inline`); external builds are surfaceable but
 * not silently rewritten.
 */

export type ComposeBuildRef = {
  kind: 'none' | 'inline' | 'external'
  context: string
  dockerfileInline: string
  dockerfilePath: string
}

export const DEFAULT_INLINE_DOCKERFILE = `FROM alpine:latest
WORKDIR /app
`

function isPlainMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function emptyComposeBuildRef(): ComposeBuildRef {
  return {
    kind: 'none',
    context: '',
    dockerfileInline: '',
    dockerfilePath: '',
  }
}

/**
 * Parse a Compose `build` value into a structured ref.
 * String shorthand and path-based / context-only mappings are `external`;
 * an own `dockerfile_inline` string key (including empty) is `inline`;
 * anything else is `none`.
 */
export function parseComposeBuild(value: unknown): ComposeBuildRef {
  if (typeof value === 'string') {
    const context = value.trim()
    if (!context) return emptyComposeBuildRef()
    return {
      kind: 'external',
      context,
      dockerfileInline: '',
      dockerfilePath: '',
    }
  }

  if (!isPlainMapping(value)) {
    return emptyComposeBuildRef()
  }

  const context =
    typeof value.context === 'string' ? value.context.trim() : ''
  const dockerfileInline =
    typeof value.dockerfile_inline === 'string' ? value.dockerfile_inline : ''
  const dockerfilePath =
    typeof value.dockerfile === 'string' ? value.dockerfile.trim() : ''

  // Own `dockerfile_inline` string (including empty) is inline so select-all
  // during edit does not flip to external path-based UX.
  if (
    Object.hasOwn(value, 'dockerfile_inline') &&
    typeof value.dockerfile_inline === 'string'
  ) {
    return {
      kind: 'inline',
      context: context || '.',
      dockerfileInline,
      dockerfilePath: '',
    }
  }

  if (dockerfilePath.length > 0 || context.length > 0) {
    return {
      kind: 'external',
      context: context || '.',
      dockerfileInline: '',
      dockerfilePath,
    }
  }

  return emptyComposeBuildRef()
}

/**
 * Set / replace the inline Dockerfile on a `build` mapping. Preserves
 * unrelated keys (`args`, `target`, `network`, …), defaults `context` to
 * `'.'`, and drops a conflicting `dockerfile` path (Compose forbids both).
 */
export function setComposeBuildInline(
  current: unknown,
  text: string,
): Record<string, unknown> {
  const base = isPlainMapping(current) ? { ...current } : {}
  if (typeof current === 'string' && current.trim()) {
    base.context = current.trim()
  }
  if (typeof base.context !== 'string' || base.context.trim() === '') {
    base.context = '.'
  }
  base.dockerfile_inline = text
  delete base.dockerfile
  return base
}

/**
 * Remove the inline Dockerfile. Returns the remaining `build` mapping, or
 * `undefined` when only the default `context: '.'` (or empty) would remain —
 * the caller then removes the whole `build` key.
 */
export function clearComposeBuildInline(
  current: unknown,
): Record<string, unknown> | undefined {
  if (!isPlainMapping(current)) {
    return undefined
  }

  const next = { ...current }
  delete next.dockerfile_inline

  const keys = Object.keys(next)
  if (keys.length === 0) {
    return undefined
  }

  if (
    keys.length === 1 &&
    keys[0] === 'context' &&
    typeof next.context === 'string' &&
    next.context.trim() === '.'
  ) {
    return undefined
  }

  return next
}

/** True when the Dockerfile text contains a `FROM` instruction (case-insensitive). */
export function dockerfileHasFromInstruction(text: string): boolean {
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue
    if (/^FROM\b/i.test(trimmed)) return true
  }
  return false
}
