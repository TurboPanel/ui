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
  it('uses short type labels without Docker, From, or Service', () => {
    expect(SETUP_TYPE_OPTIONS.map((option) => option.label)).toEqual([
      'Compose',
      'Template',
      'Managed',
    ])
  })

  it('describes compose as a blank slate and managed as handled for you', () => {
    const compose = SETUP_TYPE_OPTIONS.find((o) => o.type === 'docker-compose')
    const managed = SETUP_TYPE_OPTIONS.find((o) => o.type === 'managed')
    expect(compose?.description.toLowerCase()).toContain('blank slate')
    expect(managed?.description.toLowerCase()).toContain('automatically set up')
    expect(managed?.description).not.toContain('Redis')
    expect(managed?.description).not.toContain('ClickHouse')
    expect(managed?.description).not.toContain('PostgreSQL')
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
