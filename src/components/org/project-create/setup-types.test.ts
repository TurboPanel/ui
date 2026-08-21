import { describe, expect, it } from 'vitest'
import {
  SETUP_TYPE_OPTIONS,
  filterSetupCatalog,
  isCatalogEntrySelectable,
  setupOptionForChoice,
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
  it('offers Services second, between Compose and Template', () => {
    expect(SETUP_TYPE_OPTIONS.map((option) => option.label)).toEqual([
      'Compose',
      'Services',
      'Template',
      'Managed',
    ])
  })

  it('gives every card a unique choice id — React keys off it, and two cards share a type', () => {
    const choices = SETUP_TYPE_OPTIONS.map((option) => option.choice)
    expect(new Set(choices).size).toBe(choices.length)
    const types = SETUP_TYPE_OPTIONS.map((option) => option.type)
    expect(new Set(types).size).toBeLessThan(types.length)
  })

  it('makes Compose and Services the same project type, differing only by tab', () => {
    const compose = setupOptionForChoice('compose')
    const services = setupOptionForChoice('services')
    expect(compose?.type).toBe('docker-compose')
    expect(services?.type).toBe('docker-compose')
    expect(compose?.section).toBe('compose')
    expect(services?.section).toBe('services')
  })

  it('never opens a compose draft on Overview — the operator picked a surface', () => {
    for (const option of SETUP_TYPE_OPTIONS) {
      if (option.type !== 'docker-compose') continue
      expect(option.section).not.toBe('overview')
    }
  })

  it('names YAML on both compose cards — it is what tells them apart', () => {
    const compose = setupOptionForChoice('compose')
    const services = setupOptionForChoice('services')
    expect(compose?.description.toLowerCase()).toContain('blank slate')
    expect(compose?.description).toContain('YAML')
    expect(services?.description).toContain('YAML')
  })

  /**
   * Managed happens to be databases today, but the catalog is meant to grow
   * past them — the card must not promise a database.
   */
  it('keeps engine names and the word database off the Managed card', () => {
    const managed = setupOptionForChoice('managed')
    expect(managed?.description).not.toContain('Redis')
    expect(managed?.description).not.toContain('ClickHouse')
    expect(managed?.description).not.toContain('PostgreSQL')
    expect(managed?.description.toLowerCase()).not.toContain('database')
  })

  /**
   * TurboPanel is self-hosted: the operator's own servers run the container.
   * Managed means we configure it, never that we host or run it.
   */
  it('says Managed runs on the operator’s own servers, not ours', () => {
    const managed = setupOptionForChoice('managed')
    expect(managed?.description.toLowerCase()).toContain('your own servers')
    for (const option of SETUP_TYPE_OPTIONS) {
      expect(option.description).not.toMatch(/\bwe run\b|\bwe host\b/i)
    }
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
