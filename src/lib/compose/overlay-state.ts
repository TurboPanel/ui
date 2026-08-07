import { isBlankComposeData, normalizeCompose } from './types'

export type ComposeOverlayState = {
  blank: boolean
  overriddenKeys: string[]
  serviceNames: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Classify an environment compose overlay as blank (inheriting) or overridden,
 * surfacing top-level keys and service names for summary copy.
 */
export function resolveComposeOverlayState(
  overlay: unknown,
): ComposeOverlayState {
  const document = normalizeCompose(overlay)
  if (isBlankComposeData(document.data)) {
    return { blank: true, overriddenKeys: [], serviceNames: [] }
  }

  const overriddenKeys = Object.keys(document.data).sort((a, b) =>
    a.localeCompare(b),
  )
  const services = document.data.services
  const serviceNames = isRecord(services)
    ? Object.keys(services).sort((a, b) => a.localeCompare(b))
    : []

  return { blank: false, overriddenKeys, serviceNames }
}
