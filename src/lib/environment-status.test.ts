import { describe, expect, it } from 'vitest'
import type { DeploymentGroup } from './deployment-history'
import {
  environmentStatusFacts,
  environmentSiteHostnames,
  formatAgo,
  primarySiteHostname,
  readPrimaryHostnameOption,
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
    cancelRequestedAt: null,
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

const hosting = (createdAt: string, hostnames: unknown, bind?: string) => ({
  createdAt,
  options: { hostnames, ...(bind ? { bind } : {}) },
})

describe('environmentSiteHostnames', () => {
  it('lists every public hostname, oldest hosting row first, each once', () => {
    const rows = {
      a: [hosting('2026-10-03T00:00:00Z', ['new.test', '*.wild.test'])],
      b: [
        hosting('2026-10-01T00:00:00Z', [' shop.test ', 'www.shop.test']),
        hosting('2026-10-02T00:00:00Z', ['SHOP.test', 'inside.test'], 'local'),
        hosting('2026-10-02T00:00:00Z', ['tcp-only.test'], 'datacenter'),
      ],
      c: [{ createdAt: '2026-10-01T00:00:00Z', options: null }],
    }
    expect(environmentSiteHostnames(rows, ['a', 'b', 'c'])).toEqual([
      'shop.test',
      'www.shop.test',
      'new.test',
    ])
    expect(environmentSiteHostnames(rows, ['a'])).toEqual(['new.test'])
  })

  it('is empty with no rows, no services or no hostnames', () => {
    expect(environmentSiteHostnames({}, [])).toEqual([])
    expect(environmentSiteHostnames({ a: [] }, ['a', 'missing'])).toEqual([])
    expect(environmentSiteHostnames({ a: [hosting('', 'x.test')] }, ['a'])).toEqual([])
  })
})

describe('primarySiteHostname', () => {
  const names = ['shop.test', 'www.shop.test', 'new.test']

  it('uses the stored primary while it is still one of the hostnames', () => {
    expect(primarySiteHostname(names, 'new.test')).toBe('new.test')
    expect(primarySiteHostname(names, 'NEW.test')).toBe('new.test')
  })

  it('falls back to the oldest hostname when none is stored or it is gone', () => {
    expect(primarySiteHostname(names, null)).toBe('shop.test')
    expect(primarySiteHostname(names, 'removed.test')).toBe('shop.test')
  })

  it('is null without hostnames', () => {
    expect(primarySiteHostname([], 'shop.test')).toBeNull()
  })
})

describe('readPrimaryHostnameOption', () => {
  it('reads a non-empty string and ignores anything else', () => {
    expect(readPrimaryHostnameOption({ primaryHostname: 'shop.test' })).toBe('shop.test')
    expect(readPrimaryHostnameOption({ primaryHostname: ' ' })).toBeNull()
    expect(readPrimaryHostnameOption({ primaryHostname: 3 })).toBeNull()
    expect(readPrimaryHostnameOption(null)).toBeNull()
    expect(readPrimaryHostnameOption([])).toBeNull()
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
      })[2]?.value
    ).toBe('3 changes')
  })
})

describe('environmentStatusFacts while a deploy runs', () => {
  const running = {
    status: 'running',
    strategyOutcome: null,
    startedAt: '2026-10-05T11:56:00Z',
    cancelRequestedAt: null,
  } as unknown as DeploymentGroup

  it('puts the step the server is on in the deploy fact', () => {
    const facts = environmentStatusFacts({
      runningLabel: 'Running',
      lastDeploy: running,
      progressLabel: 'Step 3 of 7 · Installing Docker',
      now: NOW,
    })
    expect(facts[1]).toEqual({
      key: 'lastDeploy',
      caption: 'Deploying',
      value: 'Step 3 of 7 · Installing Docker',
      tone: 'busy',
    })
  })

  it('keeps the usual verdict once the deploy is over, whatever the step text says', () => {
    const done = { ...running, status: 'succeeded' } as unknown as DeploymentGroup
    const facts = environmentStatusFacts({
      runningLabel: 'Running',
      lastDeploy: done,
      progressLabel: 'Step 7 of 7 · Checking it answers',
      now: NOW,
    })
    expect(facts[1]?.caption).toBe('Last deploy')
    expect(facts[1]?.value).toMatch(/^Succeeded/)
  })
})

describe('environmentStatusFacts uses the started rule of the Deployments tab', () => {
  const command = (startedAt: string | null) =>
    ({ id: 'c1', status: 'sent', startedAt }) as unknown as DeploymentGroup['commands'][number]

  it('reads a delivered deploy the server has started as running, not queued', () => {
    const facts = environmentStatusFacts({
      runningLabel: 'Running',
      lastDeploy: group({ status: 'sent', commands: [command('2026-10-05T11:59:00Z')] }),
      now: NOW,
    })
    expect(facts[1]?.value).toBe('Running · 2h ago')
    expect(facts[1]?.tone).toBe('busy')
  })

  it('keeps a deploy the server has not started queued', () => {
    const facts = environmentStatusFacts({
      runningLabel: 'Running',
      lastDeploy: group({ status: 'sent', commands: [command(null)] }),
      now: NOW,
    })
    expect(facts[1]?.value).toBe('Queued · 2h ago')
  })
})
