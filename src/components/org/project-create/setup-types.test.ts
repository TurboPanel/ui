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
  it('groups the four compose lenses before the two catalog cards', () => {
    expect(SETUP_TYPE_OPTIONS.map((option) => option.label)).toEqual([
      'Compose',
      'Services',
      'Repository',
      'Hosting',
      'Template',
      'Managed',
    ])
  })

  /**
   * `?type=docker-compose` predates the extra compose cards and has always
   * meant the blank YAML slate. `parsePreselectedChoice` resolves a bare
   * project type to the first card offering it, so Compose has to stay first.
   */
  it('keeps Compose the first card offering docker-compose', () => {
    const first = SETUP_TYPE_OPTIONS.find(
      (option) => option.type === 'docker-compose',
    )
    expect(first?.choice).toBe('compose')
  })

  it('lands the repository card on the compose surface as docker-compose', () => {
    const repository = setupOptionForChoice('repository')
    expect(repository?.type).toBe('docker-compose')
    expect(repository?.section).toBe('services')
  })

  /**
   * The operator's own servers check out and build the repository. Nothing is
   * fetched, built, or hosted by TurboPanel on their behalf.
   */
  it('keeps remote build/host promises off the repository card', () => {
    const repository = setupOptionForChoice('repository')
    expect(repository?.description).not.toMatch(
      /\bwe (build|deploy|host|run)\b|\bour (servers|infrastructure|cloud)\b/i,
    )
  })

  it('gives every card a unique choice id — React keys off it, and two cards share a type', () => {
    const choices = SETUP_TYPE_OPTIONS.map((option) => option.choice)
    expect(new Set(choices).size).toBe(choices.length)
    const types = SETUP_TYPE_OPTIONS.map((option) => option.type)
    expect(new Set(types).size).toBeLessThan(types.length)
  })

  it('makes Compose and Services the same project type, differing only by lens', () => {
    const compose = setupOptionForChoice('compose')
    const services = setupOptionForChoice('services')
    expect(compose?.type).toBe('docker-compose')
    expect(services?.type).toBe('docker-compose')
    // Compose lens vs the Services lens (service list, on the overview path).
    expect(compose?.section).toBe('compose')
    expect(services?.section).toBe('services')
  })

  it('opens every compose draft on a lens the operator picked', () => {
    for (const option of SETUP_TYPE_OPTIONS) {
      if (option.type !== 'docker-compose') continue
      expect(['compose', 'services', 'overview']).toContain(option.section)
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

describe('the Hosting card', () => {
  it('lands on the compose surface as docker-compose', () => {
    // A site *is* a compose service — the format just declares almost nothing
    // for it. A second creation path would need a second service writer, a
    // second deploy-prepare, and second read paths.
    const hosting = setupOptionForChoice('hosting')
    expect(hosting?.type).toBe('docker-compose')
    expect(hosting?.section).toBe('services')
  })

  it('does not sit ahead of Compose', () => {
    const labels = SETUP_TYPE_OPTIONS.map((option) => option.label)
    expect(labels.indexOf('Hosting')).toBeGreaterThan(labels.indexOf('Compose'))
  })

  it('describes the capability without disparaging it', () => {
    // PHP and WordPress hosting is a market to serve on purpose, not a legacy
    // tail to tolerate. "traditional" / "legacy" / "classic" tell that audience
    // they are a concession.
    const text =
      `${setupOptionForChoice('hosting')?.label} ${setupOptionForChoice('hosting')?.description}`
        .toLowerCase()
    for (const word of ['traditional', 'legacy', 'classic', 'old-school', 'still']) {
      expect(text).not.toContain(word)
    }
  })

  it('promises SFTP, which the access subsystem now delivers', () => {
    expect(setupOptionForChoice('hosting')?.description).toContain('SFTP')
  })
})
