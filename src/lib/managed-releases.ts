/**
 * Managed-engine release catalog (UI mirror).
 *
 * A managed service's user-facing version is an **engine series** (`18`, `9.7`,
 * `12.3`), not an OCI tag — the create wizard picks a series plus a base-OS
 * **variant** and the control plane resolves the image. This file must stay in
 * sync with `turbopanel/src/lib/managed/releases.ts` (control plane, source of
 * truth) and `turbopaneld/src/instance/commands/contracts.ts` (daemon payload
 * allowlist); `managed-releases.test.ts` pins the literal set.
 */

export type ManagedEngineLifecycle = 'lts' | 'supported' | 'legacy'

export type ManagedImageVariant = {
  /** Stable identifier sent as `imageVariant` (`alpine`, `debian`, `oraclelinux9`, `ubi`). */
  id: string
  label: string
  /** Fully-qualified image reference for this series + variant. */
  image: string
}

export type ManagedEngineRelease = {
  engine: string
  /** Upstream version series — the operator-facing "version". */
  series: string
  lifecycle: ManagedEngineLifecycle
  /** Exactly one release per engine is the default for new clusters. */
  isDefault: boolean
  /** Display order; the first entry is this series' default variant. */
  variants: readonly ManagedImageVariant[]
}

const DEBIAN = 'Debian'

function postgresRelease(series: string, isDefault = false): ManagedEngineRelease {
  return {
    engine: 'postgres',
    series,
    lifecycle: 'supported',
    isDefault,
    variants: [
      { id: 'alpine', label: 'Alpine', image: `docker.io/library/postgres:${series}-alpine` },
      { id: 'debian', label: DEBIAN, image: `docker.io/library/postgres:${series}` },
    ],
  }
}

/** MySQL dropped Alpine after 8.0; Oracle Linux 9 is the vendor alternative. */
function mysqlRelease(series: string, isDefault = false): ManagedEngineRelease {
  return {
    engine: 'mysql',
    series,
    lifecycle: 'lts',
    isDefault,
    variants: [
      { id: 'debian', label: DEBIAN, image: `docker.io/library/mysql:${series}` },
      {
        id: 'oraclelinux9',
        label: 'Oracle Linux 9',
        image: `docker.io/library/mysql:${series}-oraclelinux9`,
      },
    ],
  }
}

/** MariaDB has never shipped Alpine; UBI is the vendor-published alternative. */
function mariadbRelease(series: string, isDefault = false): ManagedEngineRelease {
  return {
    engine: 'mariadb',
    series,
    lifecycle: 'lts',
    isDefault,
    variants: [
      { id: 'debian', label: DEBIAN, image: `docker.io/library/mariadb:${series}` },
      { id: 'ubi', label: 'UBI', image: `docker.io/library/mariadb:${series}-ubi` },
    ],
  }
}

/**
 * Supported series for new clusters, newest first per engine. PostgreSQL stops
 * at 15 to bound the replication test matrix; MySQL 8.0 is absent because it
 * reached EOL in April 2026.
 */
export const MANAGED_ENGINE_RELEASES: readonly ManagedEngineRelease[] = [
  postgresRelease('18', true),
  postgresRelease('17'),
  postgresRelease('16'),
  postgresRelease('15'),
  mysqlRelease('9.7', true),
  mysqlRelease('8.4'),
  mariadbRelease('12.3', true),
  mariadbRelease('11.8'),
  mariadbRelease('11.4'),
  mariadbRelease('10.11'),
]

/** Releases for `engine` in display order; empty when the engine has no catalog. */
export function managedReleasesForEngine(
  engine: string | null | undefined,
): readonly ManagedEngineRelease[] {
  if (!engine) return []
  return MANAGED_ENGINE_RELEASES.filter((release) => release.engine === engine)
}

/** The default series for `engine`, or `undefined` when the engine has no catalog. */
export function defaultManagedRelease(
  engine: string | null | undefined,
): ManagedEngineRelease | undefined {
  const releases = managedReleasesForEngine(engine)
  return releases.find((release) => release.isDefault) ?? releases[0]
}

/** Default image (default series, default variant) for `engine`. */
export function defaultManagedImage(engine: string | null | undefined): string | undefined {
  return defaultManagedRelease(engine)?.variants[0]?.image
}

/** Every image `engine` accepts, in display order — mirrors the instance allowlist. */
export function managedAllowedImagesForEngine(
  engine: string | null | undefined,
): readonly string[] {
  return managedReleasesForEngine(engine).flatMap((release) =>
    release.variants.map((variant) => variant.image),
  )
}

/** Resolve `series` + optional `variantId` (default variant when omitted) to an image. */
export function resolveManagedImage(
  engine: string | null | undefined,
  series: string,
  variantId?: string,
): string | undefined {
  const release = managedReleasesForEngine(engine).find((row) => row.series === series)
  if (!release) return undefined
  if (variantId === undefined) return release.variants[0]?.image
  return release.variants.find((variant) => variant.id === variantId)?.image
}

export type ManagedImageDescriptor = {
  engine: string
  series: string
  lifecycle: ManagedEngineLifecycle
  variantId: string
}

/**
 * Reverse-lookup a catalog image to its series + variant so a persisted
 * `settings.image` can be rendered as a version. `undefined` for images outside
 * the catalog (retired series, engines without a catalog).
 */
export function describeManagedImage(
  image: string | null | undefined,
): ManagedImageDescriptor | undefined {
  if (!image) return undefined
  for (const release of MANAGED_ENGINE_RELEASES) {
    for (const variant of release.variants) {
      if (variant.image === image) {
        return {
          engine: release.engine,
          series: release.series,
          lifecycle: release.lifecycle,
          variantId: variant.id,
        }
      }
    }
  }
  return undefined
}

/**
 * Images an existing cluster may switch to: variants of the series it already
 * runs. Changing series in place is refused by the control plane
 * (`managed_series_immutable`) because an engine will not start on another
 * major's data directory, so the Settings picker must not offer it.
 *
 * Falls back to the engine's full allowlist when the current image is not in the
 * catalog (nothing to anchor a series on).
 */
export function managedVariantImagesForImage(
  engine: string | null | undefined,
  image: string | null | undefined,
): readonly string[] {
  const current = describeManagedImage(image)
  if (!current) return managedAllowedImagesForEngine(engine)
  const release = managedReleasesForEngine(current.engine).find(
    (row) => row.series === current.series,
  )
  return release?.variants.map((variant) => variant.image) ?? []
}

/** `Alpine` / `Debian` / … for a catalog image; the raw reference otherwise. */
export function managedImageVariantLabel(image: string): string {
  for (const release of MANAGED_ENGINE_RELEASES) {
    for (const variant of release.variants) {
      if (variant.image === image) return variant.label
    }
  }
  return image
}

/** `18` → `18 (recommended)`; legacy series are flagged. */
export function managedSeriesLabel(release: ManagedEngineRelease): string {
  if (release.isDefault) return `${release.series} (recommended)`
  if (release.lifecycle === 'legacy') return `${release.series} (legacy)`
  return release.series
}

/**
 * Header form of a running release: `PostgreSQL 18 · Alpine`. `null` when there
 * is no catalog identity to describe (`engineLabel` unknown or the image is
 * outside the catalog), so callers can omit the line entirely.
 */
export function managedReleaseSummary(
  engineLabel: string | null | undefined,
  release: { series: string; variantId: string } | null | undefined,
): string | null {
  if (!release) return null
  const variant = MANAGED_ENGINE_RELEASES.flatMap((row) => row.variants).find(
    (candidate) => candidate.id === release.variantId,
  )
  const version = engineLabel ? `${engineLabel} ${release.series}` : release.series
  return variant ? `${version} · ${variant.label}` : version
}
