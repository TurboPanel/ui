import { describe, expect, it } from 'vitest'
import {
  MANAGED_SERVICE_CATALOG,
  managedCatalogEntryForCode,
  managedEngineSupportsBackup,
} from './managed-services'

describe('MANAGED_SERVICE_CATALOG image allowlists', () => {
  it('advertises the approved LTS default for every available engine', () => {
    expect(managedCatalogEntryForCode('postgres')?.defaultImage).toBe(
      'docker.io/library/postgres:18-alpine',
    )
    // MySQL/MariaDB defaults must stay on the approved LTS majors — never an
    // old major like `mysql:8` / `mariadb:11` (mirrors the instance
    // allowlists in `turbopanel/src/lib/managed/settings.ts`).
    expect(managedCatalogEntryForCode('mysql')?.defaultImage).toBe(
      'docker.io/library/mysql:9.7',
    )
    expect(managedCatalogEntryForCode('mariadb')?.defaultImage).toBe(
      'docker.io/library/mariadb:12.3',
    )
  })

  it('lists the default image inside its own allowedImages set for every engine', () => {
    for (const entry of MANAGED_SERVICE_CATALOG) {
      expect(entry.allowedImages).toContain(entry.defaultImage)
      expect(entry.allowedImages.length).toBeGreaterThan(0)
    }
  })

  it('never mixes allowlists across engines', () => {
    const postgres = managedCatalogEntryForCode('postgres')
    const mysql = managedCatalogEntryForCode('mysql')
    const mariadb = managedCatalogEntryForCode('mariadb')
    expect(postgres?.allowedImages.some((image) => image.includes('mysql'))).toBe(false)
    expect(postgres?.allowedImages.some((image) => image.includes('mariadb'))).toBe(false)
    expect(mysql?.allowedImages.some((image) => image.includes('mariadb'))).toBe(false)
    expect(mariadb?.allowedImages.some((image) => image.includes('mysql:'))).toBe(false)
  })
})

describe('managedEngineSupportsBackup', () => {
  it('is true for every engine whose backend spec declares a backup descriptor', () => {
    expect(managedEngineSupportsBackup('postgres')).toBe(true)
    expect(managedEngineSupportsBackup('mysql')).toBe(true)
    expect(managedEngineSupportsBackup('mariadb')).toBe(true)
  })

  it('is false for engines without a backup descriptor and for unknown/null codes', () => {
    expect(managedEngineSupportsBackup('redis')).toBe(false)
    expect(managedEngineSupportsBackup('clickhouse')).toBe(false)
    expect(managedEngineSupportsBackup('not-a-real-engine')).toBe(false)
    expect(managedEngineSupportsBackup(null)).toBe(false)
    expect(managedEngineSupportsBackup(undefined)).toBe(false)
  })
})
