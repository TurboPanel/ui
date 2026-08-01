import { describe, expect, it } from 'vitest'
import {
  parseInstallBaseUrl,
  resolveDisplayedInstallCommand,
} from './install-command'

const revealed = {
  licenseId: 'license-id',
  licenseToken: 'token',
  installCommand: 'curl -fsSL turbopanel.sh/run.sh | TURBOPANEL_LICENSE=abc sh',
}

describe('parseInstallBaseUrl', () => {
  it('accepts https origins and allows http when requested', () => {
    expect(parseInstallBaseUrl('https://panel.example.com')).toBe(
      'https://panel.example.com',
    )
    expect(parseInstallBaseUrl('http://dev.example.com:8880')).toBeNull()
    expect(
      parseInstallBaseUrl('http://dev.example.com:8880', { allowHttp: true }),
    ).toBe('http://dev.example.com:8880')
  })

  it('rejects paths, query strings, credentials, and shell metacharacters', () => {
    expect(parseInstallBaseUrl('https://panel.example.com/admin')).toBeNull()
    expect(parseInstallBaseUrl('https://panel.example.com?x=1')).toBeNull()
    expect(
      parseInstallBaseUrl('https://user:pass@panel.example.com'),
    ).toBeNull()
    expect(
      parseInstallBaseUrl('https://panel.example.com; curl http://evil'),
    ).toBeNull()
    expect(
      parseInstallBaseUrl('https://panel.example.com/$(id)'),
    ).toBeNull()
  })
})

describe('resolveDisplayedInstallCommand', () => {
  it('returns the server command when the edited URL is empty', () => {
    expect(resolveDisplayedInstallCommand(revealed, '  ')).toBe(
      revealed.installCommand,
    )
  })

  it('falls back to the server command for injectable or invalid URLs', () => {
    expect(
      resolveDisplayedInstallCommand(
        revealed,
        'https://panel.example.com; curl http://attacker.example',
      ),
    ).toBe(revealed.installCommand)

    expect(
      resolveDisplayedInstallCommand(
        revealed,
        'https://panel.example.com/path with spaces',
      ),
    ).toBe(revealed.installCommand)

    expect(
      resolveDisplayedInstallCommand(
        revealed,
        'https://panel.example.com?x=$(id)',
      ),
    ).toBe(revealed.installCommand)

    expect(
      resolveDisplayedInstallCommand(
        revealed,
        'https://panel.example.com/`whoami`',
      ),
    ).toBe(revealed.installCommand)
  })

  it('emits unquoted validated HTTPS origins in the rebuilt pipeline', () => {
    const command = resolveDisplayedInstallCommand(
      revealed,
      'https://panel.example.com:8443',
    )
    const licenseArg = btoa('license-id:token')
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '')

    expect(command).toContain(
      'curl -fsSLk https://panel.example.com:8443/run.sh',
    )
    expect(command).toContain(
      'TURBOPANEL_HOST=https://panel.example.com:8443',
    )
    expect(command).toContain(`TURBOPANEL_LICENSE=${licenseArg}`)
    expect(command).toContain('TURBOPANEL_INSECURE_TLS=1')
    expect(command).not.toContain("'")
  })

  it('emits unquoted validated HTTP origins without insecure TLS flags', () => {
    const command = resolveDisplayedInstallCommand(
      revealed,
      'http://dev.example.com:8880',
    )
    expect(command).toContain('curl -fsSL http://dev.example.com:8880/run.sh')
    expect(command).not.toContain('curl -fsSLk')
    expect(command).not.toContain('TURBOPANEL_INSECURE_TLS')
    expect(command).not.toContain("'")
  })
})
