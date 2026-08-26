import { describe, expect, it } from 'vitest'
import {
  gitWebhookHint,
  LAN_WEBHOOK_NOTE,
  NO_URL_WEBHOOK_NOTE,
} from '@/lib/git-webhook-url'

describe('gitWebhookHint', () => {
  it('has no address to offer when nothing is configured', () => {
    expect(gitWebhookHint([], 'github')).toEqual({
      webhookUrl: null,
      reachable: false,
      note: NO_URL_WEBHOOK_NOTE,
    })
    expect(gitWebhookHint(['   '], 'gitlab').webhookUrl).toBeNull()
  })

  it('uses each provider ingress path', () => {
    expect(gitWebhookHint(['https://panel.example.com'], 'github').webhookUrl).toBe(
      'https://panel.example.com/webhook/github',
    )
    expect(gitWebhookHint(['https://panel.example.com'], 'gitlab').webhookUrl).toBe(
      'https://panel.example.com/webhook/gitlab',
    )
  })

  it('prefers the first publicly reachable https origin', () => {
    const hint = gitWebhookHint(
      ['https://panel.lan:8443', 'http://panel.example.com', 'https://panel.example.com/'],
      'github',
    )
    expect(hint).toEqual({
      webhookUrl: 'https://panel.example.com/webhook/github',
      reachable: true,
      note: null,
    })
  })

  it('still shows the endpoint shape for LAN-only origins, with the note', () => {
    for (const origin of [
      'https://panel.lan:8443',
      'https://10.0.0.5',
      'https://localhost:8443',
      'http://panel.example.com',
    ]) {
      const hint = gitWebhookHint([origin], 'gitlab')
      expect(hint.reachable).toBe(false)
      expect(hint.note).toBe(LAN_WEBHOOK_NOTE)
      expect(hint.webhookUrl).toBe(
        `${origin.replace(/\/$/, '')}/webhook/gitlab`,
      )
    }
  })

  it('scopes the path to one app on a self-hosted origin', () => {
    const hint = gitWebhookHint(
      ['https://panel.example.com'],
      'github',
      'ref-abc',
      'https://github.acme.test',
    )
    // GitHub Enterprise ships on its own cadence, so the App-id header is not a
    // safe single point of failure — the ref survives into the copied URL.
    expect(hint.webhookUrl).toBe(
      'https://panel.example.com/webhook/github/ref-abc',
    )
    expect(hint.reachable).toBe(true)
  })

  it('keeps the hosted path clean even when a ref exists', () => {
    const hint = gitWebhookHint(
      ['https://panel.example.com'],
      'github',
      'ref-abc',
      'https://github.com',
    )
    // Nothing internal belongs in a URL the operator pastes into github.com.
    expect(hint.webhookUrl).toBe('https://panel.example.com/webhook/github')
  })

  it('falls back to the bare path when no ref is given', () => {
    const hint = gitWebhookHint(['https://panel.example.com'], 'gitlab')
    expect(hint.webhookUrl).toBe(
      'https://panel.example.com/webhook/gitlab',
    )
  })

  it('escapes a ref so it cannot break out of its path segment', () => {
    const hint = gitWebhookHint(
      ['https://panel.example.com'],
      'github',
      'a/b',
      'https://github.acme.test',
    )
    expect(hint.webhookUrl).toBe(
      'https://panel.example.com/webhook/github/a%2Fb',
    )
  })
})
