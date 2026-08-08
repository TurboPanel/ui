/**
 * Split / join Compose `image:` references for the Services form editor.
 *
 * Format (OCI / Docker distribution reference):
 *   [registry[:port]/]<image>[:tag][@digest]
 *
 * The first path component is treated as a registry host when it looks like a
 * domain (`localhost`, contains `.`, or contains `:` for a port) — same
 * heuristic as docker/distribution `reference`.
 */

export type ComposeImageRef = {
  /** Registry host[:port]. Empty means Docker Hub (omit from the wire string). */
  registry: string
  /** Repository path (e.g. `nginx`, `library/nginx`, `org/app`). */
  image: string
  /** Tag without leading `:`. Empty omits the tag (runtime defaults to `latest`). */
  tag: string
  /** Digest without leading `@` (e.g. `sha256:…`). Empty omits. */
  digest: string
}

export function emptyComposeImageRef(): ComposeImageRef {
  return { registry: '', image: '', tag: '', digest: '' }
}

/** True when the first path component should be treated as a registry host. */
export function looksLikeRegistryHost(component: string): boolean {
  if (!component) return false
  if (component === 'localhost') return true
  if (component.includes('.') || component.includes(':')) return true
  return false
}

/**
 * Parse a Compose `image` string into registry / image / tag / digest.
 * Malformed input is best-effort (image holds the remainder).
 */
export function parseComposeImageRef(value: unknown): ComposeImageRef {
  if (typeof value !== 'string') {
    return emptyComposeImageRef()
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return emptyComposeImageRef()
  }

  let digest = ''
  let rest = trimmed
  const at = trimmed.lastIndexOf('@')
  if (at >= 0) {
    digest = trimmed.slice(at + 1).trim()
    rest = trimmed.slice(0, at)
  }

  if (!rest) {
    return { ...emptyComposeImageRef(), digest }
  }

  const slash = rest.indexOf('/')
  if (slash === -1) {
    const colon = rest.lastIndexOf(':')
    if (colon >= 0) {
      return {
        registry: '',
        image: rest.slice(0, colon),
        tag: rest.slice(colon + 1),
        digest,
      }
    }
    return { registry: '', image: rest, tag: '', digest }
  }

  const first = rest.slice(0, slash)
  const remainder = rest.slice(slash + 1)

  if (looksLikeRegistryHost(first)) {
    const colon = remainder.lastIndexOf(':')
    if (colon >= 0) {
      return {
        registry: first,
        image: remainder.slice(0, colon),
        tag: remainder.slice(colon + 1),
        digest,
      }
    }
    return { registry: first, image: remainder, tag: '', digest }
  }

  const colon = rest.lastIndexOf(':')
  if (colon >= 0) {
    return {
      registry: '',
      image: rest.slice(0, colon),
      tag: rest.slice(colon + 1),
      digest,
    }
  }
  return { registry: '', image: rest, tag: '', digest }
}

/** Build a Compose `image` string from parts. Empty image → empty string. */
export function formatComposeImageRef(ref: ComposeImageRef): string {
  const image = ref.image.trim()
  if (!image) {
    return ''
  }

  const registry = ref.registry.trim()
  const tag = ref.tag.trim()
  const digest = ref.digest.trim()

  let name = registry ? `${registry}/${image}` : image
  if (tag) {
    name = `${name}:${tag}`
  }
  if (digest) {
    name = `${name}@${digest}`
  }
  return name
}

export function patchComposeImageRef(
  current: ComposeImageRef,
  patch: Partial<ComposeImageRef>,
): ComposeImageRef {
  return {
    registry: patch.registry ?? current.registry,
    image: patch.image ?? current.image,
    tag: patch.tag ?? current.tag,
    digest: patch.digest ?? current.digest,
  }
}
