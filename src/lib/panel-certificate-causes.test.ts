import { describe, expect, it } from 'vitest'
import type { PanelDnsCause } from './instance-api'
import {
  dns01Ladder,
  PANEL_DNS_CAUSE_LABELS,
  panelDnsCauseLabel,
  panelDnsInterval,
  retryPausedUntil,
} from './panel-certificate-causes'

const CAUSES: readonly PanelDnsCause[] = [
  'zone-not-on-provider',
  'scope-missing',
  'txt-not-visible',
  'caa-forbids',
  'duplicate-limit',
  'failed-authz-limit',
  'provider-error',
  'provider-rate-limited',
  'acme-error',
  'account-error',
]

/** Book title case: every word capitalized except short joining words after the first. */
const SMALL_WORDS = new Set(['a', 'an', 'the', 'on', 'of', 'for', 'to', 'in', 'and', 'or'])

function isTitleCase(label: string): boolean {
  return label
    .split(' ')
    .every((word, index) => (index > 0 && SMALL_WORDS.has(word)) || /^[A-Z0-9]/.test(word))
}

describe('DNS-01 cause labels', () => {
  it('labels every cause in book title case', () => {
    expect(Object.keys(PANEL_DNS_CAUSE_LABELS).sort((a, b) => a.localeCompare(b))).toEqual(
      [...CAUSES].sort((a, b) => a.localeCompare(b))
    )
    for (const cause of CAUSES) {
      const label = panelDnsCauseLabel(cause)
      expect(label, cause).not.toBe(cause)
      expect(isTitleCase(label), label).toBe(true)
    }
  })

  it('shows an unknown cause as sent', () => {
    expect(panelDnsCauseLabel('brand-new')).toBe('brand-new')
  })
})

describe('dns01Ladder', () => {
  it('marks the steps before the stage done and the stage current', () => {
    const steps = dns01Ladder('waiting-dns')
    expect(steps.map((step) => step.state)).toEqual([
      'done',
      'done',
      'done',
      'done',
      'current',
      'todo',
      'todo',
      'todo',
    ])
    expect(steps[4].label).toBe('Waiting for DNS')
  })

  it('marks every step done once issued, and none current when stopped', () => {
    expect(dns01Ladder('issued').every((step) => step.state === 'done')).toBe(true)
    expect(dns01Ladder('failed').every((step) => step.state === 'todo')).toBe(true)
  })
})

describe('polling and pauses', () => {
  const base = {
    ok: true as const,
    attempts: 0,
    nextAttemptAt: null,
    stopUntil: null,
    lastError: null,
    renewAt: null,
    notAfter: null,
    expiryAlerted: [],
  }

  it('reads every 10 seconds only while waiting on DNS or validation', () => {
    expect(panelDnsInterval({ ...base, stage: 'waiting-dns' })).toBe(10_000)
    expect(panelDnsInterval({ ...base, stage: 'validating' })).toBe(10_000)
    expect(panelDnsInterval({ ...base, stage: 'issued' })).toBe(false)
    expect(panelDnsInterval(undefined)).toBe(false)
  })

  it('reports a pause only while it lasts', () => {
    const now = Date.parse('2026-11-01T12:00:00Z')
    expect(retryPausedUntil({ stopUntil: '2026-11-01T13:00:00Z' }, now)).toBe(
      '2026-11-01T13:00:00Z'
    )
    expect(retryPausedUntil({ stopUntil: '2026-11-01T11:00:00Z' }, now)).toBeNull()
    expect(retryPausedUntil({ stopUntil: 'garbage' }, now)).toBeNull()
    expect(retryPausedUntil({ stopUntil: null }, now)).toBeNull()
  })
})
