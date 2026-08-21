import { describe, expect, it } from 'vitest'
import {
  SETUP_TYPE_OPTIONS,
  filterSetupCatalog,
  isCatalogEntrySelectable,
} from '@/components/org/project-create/setup-types'
import type { CatalogSummary } from '@/lib/instance-api'

function entry(
  code: string,
  kind: CatalogSummary['kind'],
  displayName = code,
): CatalogSummary {
  return { code, kind, displayName, description: '' }
}

const CATALOG: CatalogSummary[] = [
  entry('wordpress', 'template', 'WordPress'),
  entry('ghost', 'template', 'Ghost'),
  entry('redis', 'managed'),
  entry('postgres', 'managed'),
  entry('cockroach', 'managed'),
]

describe('SETUP_TYPE_OPTIONS', () => {
  it('names the managed engines rather than saying "Postgres first"', () => {
    const managed = SETUP_TYPE_OPTIONS.find((o) => o.type === 'managed')
    expect(managed?.description).toContain('PostgreSQL')
    expect(managed?.description).toContain('MySQL')
    expect(managed?.description).toContain('MariaDB')
    expect(managed?.description).not.toContain('Postgres first')
  })
})

describe('filterSetupCatalog', () => {
  it('returns templates sorted by display name', () => {
    expect(
      filterSetupCatalog(CATALOG, 'template').map((e) => e.code),
    ).toEqual(['ghost', 'wordpress'])
  })

  it('drops managed codes with no catalog metadata and floats available ones', () => {
    const codes = filterSetupCatalog(CATALOG, 'managed').map((e) => e.code)
    expect(codes).not.toContain('cockroach')
    expect(codes[0]).toBe('postgres')
    expect(codes).toContain('redis')
  })

  it('offers nothing for compose, which has no catalog', () => {
    expect(filterSetupCatalog(CATALOG, 'docker-compose')).toEqual([])
  })
})

describe('isCatalogEntrySelectable', () => {
  it('gates managed engines on release status', () => {
    expect(isCatalogEntrySelectable(entry('postgres', 'managed'), 'managed')).toBe(true)
    expect(isCatalogEntrySelectable(entry('redis', 'managed'), 'managed')).toBe(false)
  })

  it('leaves templates always selectable', () => {
    expect(isCatalogEntrySelectable(entry('redis', 'template'), 'template')).toBe(true)
  })
})
