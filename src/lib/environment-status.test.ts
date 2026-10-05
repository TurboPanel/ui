import { describe, expect, it } from 'vitest'
import type { DeploymentGroup } from './deployment-history'
import {
  environmentStatusFacts,
  firstSiteHostname,
  formatAgo,
  siteUrlFromHostname,
} from './environment-status'

const NOW = Date.parse('2026-10-05T12:00:00.000Z')

function group(overrides: Partial<DeploymentGroup> = {}): DeploymentGroup {
  return {
    id: 'd1',
    generation: 3,
    commands: [],
    status: 'succeeded',
    actorEntityType: 'user',
    trigger: null,
    strategy: null,
    strategyOutcome: null,
    startedAt: '2026-10-05T10:00:00.000Z',
    durationMs: 1000,
    ...overrides,
  }
}

describe('siteUrlFromHostname', () => {
  it('builds an https address from a hostname', () => {
    expect(siteUrlFromHostname('shop.example.com')).toBe('https://shop.example.com')
    expect(siteUrlFromHostname('  example.com ')).toBe('https://example.com')
  })

  it('keeps a full address and rejects unusable values', () => {
    expect(siteUrlFromHostname('http://example.com/a')).toBe('http://example.com/a')
    expect(siteUrlFromHostname('https://')).toBeNull()
    expect(siteUrlFromHostname('*.example.com')).toBeNull()
    expect(siteUrlFromHostname('not a host')).toBeNull()
    expect(siteUrlFromHostname('')).toBeNull()
    expect(siteUrlFromHostname(null)).toBeNull()
    expect(siteUrlFromHostname(undefined)).toBeNull()
  })
})

describe('firstSiteHostname', () => {
  it('returns the first usable hostname in service order', () => {
    const rows = {
      a: [{ name: '*.wild.test' }, { name: null }],
      b: [{ name: ' shop.test ' }],
      c: [{ name: 'other.test' }],
    }
    expect(firstSiteHostname(rows, ['a', 'b', 'c'])).toBe('shop.test')
    expect(firstSiteHostname(rows, ['c', 'b'])).toBe('other.test')
    expect(firstSiteHostname(rows, ['a', 'missing'])).toBeNull()
    expect(firstSiteHostname({}, [])).toBeNull()
  })
})

describe('formatAgo', () => {
  it('reads seconds, minutes, hours and days', () => {
    const at = (ms: number) => new Date(NOW - ms).toISOString()
    expect(formatAgo(at(5_000), NOW)).toBe('just now')
    expect(formatAgo(at(5 * 60_000), NOW)).toBe('5m ago')
    expect(formatAgo(at(3 * 3_600_000), NOW)).toBe('3h ago')
    expect(formatAgo(at(2 * 86_400_000), NOW)).toBe('2d ago')
    expect(formatAgo(new Date(NOW + 60_000).toISOString(), NOW)).toBe('just now')
  })

  it('is null without a readable stamp', () => {
    expect(formatAgo(null, NOW)).toBeNull()
    expect(formatAgo(undefined, NOW)).toBeNull()
    expect(formatAgo('soon', NOW)).toBeNull()
  })
})

describe('environmentStatusFacts', () => {
  it('names what runs now, with a tone', () => {
    const tone = (runningLabel: string) =>
      environmentStatusFacts({ runningLabel, lastDeploy: undefined, now: NOW })[0]?.tone
    expect(tone('Running')).toBe('ok')
    expect(tone('Starting…')).toBe('busy')
    expect(tone('Stopped')).toBe('bad')
    expect(tone('Not started yet')).toBe('idle')
    expect(tone('Unknown')).toBe('idle')
  })

  it('leaves the last deploy out while history loads', () => {
    const facts = environmentStatusFacts({
      runningLabel: 'Running',
      lastDeploy: undefined,
      now: NOW,
    })
    expect(facts.map((fact) => fact.key)).toEqual(['running'])
  })

  it('says Never when there is no deploy yet', () => {
    const facts = environmentStatusFacts({
      runningLabel: 'Not started yet',
      lastDeploy: null,
      now: NOW,
    })
    expect(facts[1]).toEqual({
      key: 'lastDeploy',
      caption: 'Last deploy',
      value: 'Never',
      tone: 'idle',
    })
  })

  it('reports the last deploy result and when', () => {
    const value = (deploy: DeploymentGroup) =>
      environmentStatusFacts({ runningLabel: 'Running', lastDeploy: deploy, now: NOW })[1]
    expect(value(group())).toMatchObject({ value: 'Succeeded · 2h ago', tone: 'ok' })
    expect(value(group({ status: 'failed' }))).toMatchObject({
      value: 'Failed · 2h ago',
      tone: 'bad',
    })
    expect(value(group({ status: 'running' }))).toMatchObject({
      value: 'Running · 2h ago',
      tone: 'busy',
    })
    expect(value(group({ strategyOutcome: 'rolled_back' }))).toMatchObject({
      value: 'Rolled back · 2h ago',
      tone: 'bad',
    })
    expect(value(group({ startedAt: null }))).toMatchObject({ value: 'Succeeded' })
  })

  it('adds the not-deployed count only when there is a real one', () => {
    const keys = (changesNotDeployed?: number | null) =>
      environmentStatusFacts({
        runningLabel: 'Running',
        lastDeploy: null,
        changesNotDeployed,
        now: NOW,
      }).map((fact) => fact.key)
    expect(keys()).toEqual(['running', 'lastDeploy'])
    expect(keys(null)).toEqual(['running', 'lastDeploy'])
    expect(keys(0)).toEqual(['running', 'lastDeploy'])
    expect(keys(2)).toEqual(['running', 'lastDeploy', 'changes'])
    const facts = environmentStatusFacts({
      runningLabel: 'Running',
      lastDeploy: null,
      changesNotDeployed: 1,
      now: NOW,
    })
    expect(facts[2]).toMatchObject({ value: '1 change', caption: 'Not deployed' })
    expect(
      environmentStatusFacts({
        runningLabel: 'Running',
        lastDeploy: null,
        changesNotDeployed: 3,
        now: NOW,
      })[2]?.value,
    ).toBe('3 changes')
  })
})
