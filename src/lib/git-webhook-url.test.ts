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
      'https://panel.example.com/api/git/v1/github/webhook',
    )
    expect(gitWebhookHint(['https://panel.example.com'], 'gitlab').webhookUrl).toBe(
      'https://panel.example.com/api/git/v1/gitlab/webhook',
    )
  })

  it('prefers the first publicly reachable https origin', () => {
    const hint = gitWebhookHint(
      ['https://panel.lan:8443', 'http://panel.example.com', 'https://panel.example.com/'],
      'github',
    )
    expect(hint).toEqual({
      webhookUrl: 'https://panel.example.com/api/git/v1/github/webhook',
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
        `${origin.replace(/\/$/, '')}/api/git/v1/gitlab/webhook`,
      )
    }
  })

  it('scopes the path to one app when given a webhook ref', () => {
    const hint = gitWebhookHint(
      ['https://panel.example.com'],
      'github',
      'ref-abc',
    )
    // The ref is what lets a delivery name its app before any secret is
    // consulted, so it has to survive into the URL the operator copies.
    expect(hint.webhookUrl).toBe(
      'https://panel.example.com/api/git/v1/github/webhook/ref-abc',
    )
    expect(hint.reachable).toBe(true)
  })

  it('falls back to the bare path when no ref is given', () => {
    const hint = gitWebhookHint(['https://panel.example.com'], 'gitlab')
    expect(hint.webhookUrl).toBe(
      'https://panel.example.com/api/git/v1/gitlab/webhook',
    )
  })

  it('escapes a ref so it cannot break out of its path segment', () => {
    const hint = gitWebhookHint(['https://panel.example.com'], 'github', 'a/b')
    expect(hint.webhookUrl).toBe(
      'https://panel.example.com/api/git/v1/github/webhook/a%2Fb',
    )
  })
})
