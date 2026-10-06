import { describe, expect, it } from 'vitest'
import { deployErrorMessage } from '@/lib/deploy-error-message'

const wrapped = (code: string, sentence: string) =>
  new Error(`/api/client/v1/environments/e1/deploy failed: 403 ${code} — ${sentence}`)

describe('deployErrorMessage', () => {
  it('shows only the server sentence for a host-level refusal', () => {
    const sentence =
      'This compose document reaches the host through services.web.volumes[0]. Only an organization manager or owner can deploy host-level Compose features.'
    expect(
      deployErrorMessage(wrapped('compose_host_access_requires_manager', sentence)),
    ).toBe(sentence)
  })

  it('shows the approval sentence for a webhook deploy nobody approved', () => {
    const sentence = 'Deploy it once from the console to approve it.'
    expect(
      deployErrorMessage(wrapped('compose_host_access_requires_approval', sentence)),
    ).toBe(sentence)
  })

  it('still names the refusal when the server sent no sentence', () => {
    expect(
      deployErrorMessage(new Error('deploy failed: 403 compose_host_access_requires_manager')),
    ).toContain('host-level Compose features')
  })

  it('keeps the existing mappings and passes other messages through', () => {
    expect(deployErrorMessage(new Error('x server_placement_mismatch'))).toContain('pinned server')
    expect(deployErrorMessage(new Error('something else'))).toBe('something else')
    expect(deployErrorMessage('not an error')).toBe('Failed to deploy environment')
  })

  it('shows the plain sentence when a certificate misses a www name', () => {
    const sentence =
      'The certificate on this hosting must also cover www.example.com because of its www setting.'
    expect(deployErrorMessage(wrapped('tls_pin_mismatch', sentence))).toBe(sentence)
    expect(deployErrorMessage(new Error('deploy failed: 400 tls_pin_mismatch'))).toContain(
      'does not cover every name',
    )
  })
})
