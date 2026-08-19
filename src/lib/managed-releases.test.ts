import { describe, expect, it } from 'vitest'
import {
  MANAGED_ENGINE_RELEASES,
  defaultManagedImage,
  defaultManagedRelease,
  describeManagedImage,
  managedAllowedImagesForEngine,
  managedImageVariantLabel,
  managedReleaseSummary,
  managedReleasesForEngine,
  managedSeriesLabel,
  managedVariantImagesForImage,
  resolveManagedImage,
} from '@/lib/managed-releases'
import { MANAGED_SERVICE_CATALOG, managedCatalogEntryForCode } from '@/lib/managed-services'

describe('MANAGED_ENGINE_RELEASES', () => {
  it('pins the supported series per engine (mirror of the control-plane catalog)', () => {
    expect(managedReleasesForEngine('postgres').map((row) => row.series)).toEqual([
      '18',
      '17',
      '16',
      '15',
    ])
    expect(managedReleasesForEngine('mysql').map((row) => row.series)).toEqual([
      '9.7',
      '8.4',
    ])
    expect(managedReleasesForEngine('mariadb').map((row) => row.series)).toEqual([
      '12.3',
      '11.8',
      '11.4',
      '10.11',
    ])
  })

  it('never offers an EOL series', () => {
    // MySQL 8.0 reached EOL in April 2026.
    expect(managedReleasesForEngine('mysql').some((row) => row.series === '8.0')).toBe(
      false,
    )
    expect(managedAllowedImagesForEngine('mysql')).not.toContain(
      'docker.io/library/mysql:8.0',
    )
  })

  it('has exactly one default per engine, with variants in display order', () => {
    for (const engine of ['postgres', 'mysql', 'mariadb']) {
      const releases = managedReleasesForEngine(engine)
      expect(releases.filter((row) => row.isDefault)).toHaveLength(1)
      for (const release of releases) {
        expect(release.variants.length).toBeGreaterThan(0)
        const ids = release.variants.map((variant) => variant.id)
        expect(new Set(ids).size).toBe(ids.length)
      }
    }
  })

  it('resolves unique images across the whole catalog', () => {
    const images = MANAGED_ENGINE_RELEASES.flatMap((release) =>
      release.variants.map((variant) => variant.image),
    )
    expect(new Set(images).size).toBe(images.length)
  })

  it('defaults to the newest series and its first variant', () => {
    expect(defaultManagedRelease('postgres')?.series).toBe('18')
    expect(defaultManagedImage('postgres')).toBe('docker.io/library/postgres:18-alpine')
    expect(defaultManagedImage('mysql')).toBe('docker.io/library/mysql:9.7')
    expect(defaultManagedImage('mariadb')).toBe('docker.io/library/mariadb:12.3')
  })

  it('has no catalog for engines that are not managed SQL yet', () => {
    expect(managedReleasesForEngine('redis')).toEqual([])
    expect(managedReleasesForEngine(null)).toEqual([])
    expect(defaultManagedImage('clickhouse')).toBeUndefined()
  })
})

describe('MANAGED_SERVICE_CATALOG derives from the release catalog', () => {
  it('uses the catalog default and full allowlist for every SQL engine', () => {
    for (const engine of ['postgres', 'mysql', 'mariadb']) {
      const entry = managedCatalogEntryForCode(engine)
      expect(entry?.defaultImage).toBe(defaultManagedImage(engine))
      expect(entry?.allowedImages).toEqual(managedAllowedImagesForEngine(engine))
    }
  })

  it('keeps engines without a catalog on a single default image', () => {
    for (const entry of MANAGED_SERVICE_CATALOG) {
      if (managedReleasesForEngine(entry.engine).length > 0) continue
      expect(entry.allowedImages).toEqual([entry.defaultImage])
    }
  })
})

describe('resolveManagedImage', () => {
  it('maps series plus variant to an image', () => {
    expect(resolveManagedImage('postgres', '16', 'debian')).toBe(
      'docker.io/library/postgres:16',
    )
    expect(resolveManagedImage('mariadb', '11.4', 'ubi')).toBe(
      'docker.io/library/mariadb:11.4-ubi',
    )
  })

  it('falls back to the series default variant when none is given', () => {
    expect(resolveManagedImage('postgres', '17')).toBe(
      'docker.io/library/postgres:17-alpine',
    )
  })

  it('is undefined for an unknown series or variant', () => {
    expect(resolveManagedImage('postgres', '14')).toBeUndefined()
    expect(resolveManagedImage('postgres', '18', 'ubi')).toBeUndefined()
    expect(resolveManagedImage('redis', '7')).toBeUndefined()
  })
})

describe('describeManagedImage', () => {
  it('round-trips every catalog image to its series and variant', () => {
    for (const release of MANAGED_ENGINE_RELEASES) {
      for (const variant of release.variants) {
        expect(describeManagedImage(variant.image)).toEqual({
          engine: release.engine,
          series: release.series,
          lifecycle: release.lifecycle,
          variantId: variant.id,
        })
      }
    }
  })

  it('is undefined outside the catalog', () => {
    expect(describeManagedImage('docker.io/library/postgres:14-alpine')).toBeUndefined()
    expect(describeManagedImage(null)).toBeUndefined()
    expect(describeManagedImage('')).toBeUndefined()
  })
})

describe('managedVariantImagesForImage', () => {
  it('offers only other base-OS variants of the running series', () => {
    expect(
      managedVariantImagesForImage('postgres', 'docker.io/library/postgres:16-alpine'),
    ).toEqual(['docker.io/library/postgres:16-alpine', 'docker.io/library/postgres:16'])
  })

  it('never offers another series (series changes are refused server-side)', () => {
    const options = managedVariantImagesForImage(
      'postgres',
      'docker.io/library/postgres:18-alpine',
    )
    expect(options).not.toContain('docker.io/library/postgres:17-alpine')
    expect(options).not.toContain('docker.io/library/postgres:15')
  })

  it('falls back to the engine allowlist for an uncatalogued image', () => {
    expect(managedVariantImagesForImage('postgres', 'docker.io/library/postgres:14')).toEqual(
      managedAllowedImagesForEngine('postgres'),
    )
    expect(managedVariantImagesForImage('postgres', null)).toEqual(
      managedAllowedImagesForEngine('postgres'),
    )
  })
})

describe('display helpers', () => {
  it('labels images by base OS and falls back to the raw reference', () => {
    expect(managedImageVariantLabel('docker.io/library/postgres:18-alpine')).toBe('Alpine')
    expect(managedImageVariantLabel('docker.io/library/mysql:9.7-oraclelinux9')).toBe(
      'Oracle Linux 9',
    )
    expect(managedImageVariantLabel('docker.io/library/redis:7-alpine')).toBe(
      'docker.io/library/redis:7-alpine',
    )
  })

  it('flags the recommended series', () => {
    const [postgresDefault, postgresOlder] = managedReleasesForEngine('postgres')
    expect(managedSeriesLabel(postgresDefault!)).toBe('18 (recommended)')
    expect(managedSeriesLabel(postgresOlder!)).toBe('17')
  })

  it('flags legacy series in the picker', () => {
    expect(
      managedSeriesLabel({
        engine: 'postgres',
        series: '14',
        lifecycle: 'legacy',
        isDefault: false,
        variants: [],
      }),
    ).toBe('14 (legacy)')
  })

  it('summarizes a running release for the status header', () => {
    expect(
      managedReleaseSummary('PostgreSQL', { series: '18', variantId: 'alpine' }),
    ).toBe('PostgreSQL 18 · Alpine')
    expect(managedReleaseSummary(null, { series: '9.7', variantId: 'debian' })).toBe(
      '9.7 · Debian',
    )
    expect(managedReleaseSummary('PostgreSQL', null)).toBeNull()
    expect(
      managedReleaseSummary('PostgreSQL', { series: '18', variantId: 'unknown' }),
    ).toBe('PostgreSQL 18')
  })
})
