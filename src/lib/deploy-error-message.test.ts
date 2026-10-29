import { describe, expect, it } from 'vitest'
import { deployErrorMessage, deployRefusalMessage } from '@/lib/deploy-error-message'
import {
  DeployHealthCheckMissingError,
  DeployResourceLimitExceededError,
  DeployTunnelRefusedError,
} from '@/lib/instance-api'

const wrapped = (code: string, sentence: string) =>
  new Error(`/api/client/v1/environments/e1/deploy failed: 403 ${code} — ${sentence}`)

describe('deployErrorMessage', () => {
  it('shows only the server sentence for a host-level refusal', () => {
    const sentence =
      'This compose document reaches the host through services.web.volumes[0]. Only an organization manager or owner can deploy host-level Compose features.'
    expect(deployErrorMessage(wrapped('compose_host_access_requires_manager', sentence))).toBe(
      sentence
    )
  })

  it('shows the approval sentence for a webhook deploy nobody approved', () => {
    const sentence = 'Deploy it once from the console to approve it.'
    expect(deployErrorMessage(wrapped('compose_host_access_requires_approval', sentence))).toBe(
      sentence
    )
  })

  it('still names the refusal when the server sent no sentence', () => {
    expect(
      deployErrorMessage(new Error('deploy failed: 403 compose_host_access_requires_manager'))
    ).toContain('host-level Compose features')
  })

  it('keeps the existing mappings and passes other messages through', () => {
    expect(deployErrorMessage(new Error('x server_placement_mismatch'))).toContain('pinned server')
    expect(deployErrorMessage(new Error('something else'))).toBe('something else')
    expect(deployErrorMessage('not an error')).toBe('Failed to deploy environment')
  })

  it('shows the server sentence when compose asks for Let\u2019s Encrypt while it is off', () => {
    const sentence =
      '"web" asks for a Let\'s Encrypt certificate for app.example.com (tls.mode "automatic"), but this organization does not allow Let\'s Encrypt certificates.'
    expect(deployErrorMessage(wrapped('acme_requires_org_opt_in', sentence))).toBe(sentence)
    const bare = deployErrorMessage(new Error('deploy failed: 400 acme_requires_org_opt_in'))
    expect(bare).toContain("Allow Let's Encrypt certificates")
    expect(bare).toContain('organization owner or manager')
    expect(
      deployErrorMessage(new Error('deploy failed: 422 letsencrypt_hostname_unsupported'))
    ).toContain('wildcard')
  })

  it('shows the plain sentence when a certificate misses a www name', () => {
    const sentence =
      'The certificate on this hosting must also cover www.example.com because of its www setting.'
    expect(deployErrorMessage(wrapped('tls_pin_mismatch', sentence))).toBe(sentence)
    expect(deployErrorMessage(new Error('deploy failed: 400 tls_pin_mismatch'))).toContain(
      'does not cover every name'
    )
  })
})

describe('deployRefusalMessage', () => {
  it('words a missing or required health check with the next step', () => {
    expect(deployRefusalMessage(new DeployHealthCheckMissingError(true, ['web']))).toMatch(
      /requires a compose healthcheck/
    )
    expect(deployRefusalMessage(new DeployHealthCheckMissingError(false, ['web']))).toMatch(
      /Confirm the deploy from this environment/
    )
  })

  it('words a resource limit', () => {
    expect(deployRefusalMessage(new DeployResourceLimitExceededError([]))).toMatch(/resource limit/)
  })

  it('falls back to the coded refusals', () => {
    expect(deployRefusalMessage(new Error('409 — server_placement_mismatch'))).toBe(
      "Deploy target does not match the project's pinned server placement."
    )
  })
})

describe('tunnel deploy refusals', () => {
  it('names the hostnames and the next step for a typed refusal', () => {
    const cert = new DeployTunnelRefusedError('tunnel_name_public_certificate', ['a.example.com'])
    expect(deployRefusalMessage(cert)).toBe(
      "A tunnel-only name cannot use a public certificate (a.example.com). Choose Self-signed for this site's certificate, then deploy again."
    )
    expect(deployErrorMessage(cert)).toBe(deployRefusalMessage(cert))
    const old = new DeployTunnelRefusedError('tunnel_daemon_too_old', [
      'a.example.com',
      'b.example.com',
    ])
    expect(deployRefusalMessage(old)).toMatch(
      /Update this server .*\(a\.example\.com, b\.example\.com\)/
    )
  })
  it('still reads a coded message that lost its type', () => {
    expect(
      deployErrorMessage(
        new Error('/environments/e1/deploy failed: HTTP 409: tunnel_name_public_certificate')
      )
    ).toMatch(/cannot use a public certificate\. Choose Self-signed/)
    expect(deployErrorMessage(new Error('HTTP 409: tunnel_daemon_too_old'))).toMatch(
      /Update this server/
    )
  })
})
