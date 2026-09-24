import { compareSemver, parseSemver } from '@/lib/instance-version'

/** True when the instance reports a different semver than this client bundle. */
export function shouldPromptInstanceReload(
  bundledVersion: string | null,
  observedVersion: string | null,
): boolean {
  if (!bundledVersion?.trim() || !observedVersion?.trim()) return false
  const bundled = parseSemver(bundledVersion)
  const observed = parseSemver(observedVersion)
  if (!bundled || !observed) return bundledVersion.trim() !== observedVersion.trim()
  return compareSemver(bundled, observed) !== 0
}

function presentBuild(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  if (trimmed === '' || trimmed === 'unknown') return null
  return trimmed
}

/**
 * Control-plane revision this web bundle first observed. Later responses are
 * compared to that value. The UI repository commit is a different repository
 * and is never the baseline.
 */
let loadedControlPlaneRevision: string | null = null

export function noteLoadedControlPlaneRevision(
  observed: string | null | undefined,
): string | null {
  const present = presentBuild(observed)
  if (loadedControlPlaneRevision === null && present) {
    loadedControlPlaneRevision = present
  }
  return loadedControlPlaneRevision
}

export function resetLoadedControlPlaneRevisionForTests(): void {
  loadedControlPlaneRevision = null
}

/**
 * Reload when the control plane's revision changed after this bundle loaded.
 * Two canary builds can share a semver (`0.1.1`) and still be different
 * commits. A UI commit that differs from the control-plane commit on a current
 * install is not a mismatch. Semver remains the fallback when no revision
 * has been observed yet.
 */
export function shouldPromptControlPlaneReload(input: {
  bundledVersion: string | null
  observedVersion: string | null
  /** Control-plane revision captured when this web bundle first loaded. */
  loadedRevision: string | null
  observedRevision: string | null
  /** UI repository commit. Ignored. It is not `x-turbopanel-revision`. */
  uiCommit?: string | null
}): boolean {
  void input.uiCommit
  const loaded = presentBuild(input.loadedRevision)
  const observed = presentBuild(input.observedRevision)
  if (loaded && observed) return loaded !== observed
  return shouldPromptInstanceReload(input.bundledVersion, input.observedVersion)
}

export function reloadWebClient(): void {
  if (typeof globalThis.location?.reload === 'function') {
    globalThis.location.reload()
  }
}
