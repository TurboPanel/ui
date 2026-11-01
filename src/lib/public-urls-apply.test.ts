import { describe, expect, it } from 'vitest'
import {
  applyCertificateKind,
  publicUrlsApplyFeedback,
  reconnectedStatus,
  type PublicUrlsApplyStatus,
} from '@/lib/public-urls-apply'

describe('publicUrlsApplyFeedback', () => {
  it('says nothing while idle', () => {
    expect(publicUrlsApplyFeedback('idle')).toBeNull()
  })

  it('keeps the restart states apart', () => {
    expect(publicUrlsApplyFeedback('applying')).toMatchObject({ tone: 'pending' })
    expect(publicUrlsApplyFeedback('reconnecting')).toMatchObject({ tone: 'pending' })
    expect(publicUrlsApplyFeedback('applied')).toMatchObject({ tone: 'done' })
    expect(publicUrlsApplyFeedback('reconnected')).toMatchObject({ tone: 'done' })
    expect(publicUrlsApplyFeedback('not-saved')).toMatchObject({ tone: 'failed' })
    expect(publicUrlsApplyFeedback('unreachable')).toMatchObject({ tone: 'failed' })
  })

  it('never tells people to click through a browser certificate warning', () => {
    const statuses: PublicUrlsApplyStatus[] = [
      'applying',
      'reconnecting',
      'applied',
      'reconnected',
      'reconnected-trusted',
      'reconnected-mixed',
      'reconnected-kept',
      'not-saved',
      'unreachable',
    ]
    for (const status of statuses) {
      expect(publicUrlsApplyFeedback(status)?.message).not.toMatch(/\baccept\b|came back|—/i)
    }
    expect(publicUrlsApplyFeedback('reconnected')?.message).toBe(
      'Applied. The control plane now serves the new certificate. A self-signed certificate still triggers a browser warning on this address; use a hostname with a public certificate, or trust the Platform CA, to avoid it.'
    )
  })

  it('carries the control plane message through a real failure', () => {
    expect(publicUrlsApplyFeedback('failed', 'HTTP 500: timeout waiting for daemon')).toEqual({
      tone: 'failed',
      message: 'Apply failed: HTTP 500: timeout waiting for daemon',
    })
    expect(publicUrlsApplyFeedback('failed')?.message).toContain('unknown error')
  })

  it('has a line for every non-idle state', () => {
    const statuses: PublicUrlsApplyStatus[] = [
      'applying',
      'reconnecting',
      'applied',
      'reconnected',
      'not-saved',
      'unreachable',
      'failed',
    ]
    for (const status of statuses) {
      expect(publicUrlsApplyFeedback(status, 'x')?.message.length).toBeGreaterThan(0)
    }
  })
})

describe('certificate kind wording', () => {
  it('only mentions self-signed for Platform CA names', () => {
    expect(reconnectedStatus([{ source: 'platform-ca' }])).toBe('reconnected')
    expect(reconnectedStatus([{ source: 'lets-encrypt' }])).toBe(
      'reconnected-trusted',
    )
    expect(
      reconnectedStatus([{ source: 'platform-ca' }, { source: 'lets-encrypt' }]),
    ).toBe('reconnected-mixed')
    expect(applyCertificateKind([{ source: 'uploaded' }])).toBe('trusted')
    expect(
      publicUrlsApplyFeedback('reconnected-trusted')?.message,
    ).not.toContain('self-signed')
    expect(publicUrlsApplyFeedback('reconnected')?.message).toContain(
      'self-signed',
    )
  })

  it('is honest when an earlier certificate was kept', () => {
    expect(reconnectedStatus([{ source: 'lets-encrypt' }], true)).toBe(
      'reconnected-kept',
    )
    expect(publicUrlsApplyFeedback('reconnected-kept')?.message).toContain(
      'kept its existing certificate',
    )
  })
})
