import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildInstallCommandWithBaseUrl,
  defaultDevCaddyHttpsBaseUrl,
  defaultDevInstallBaseUrl,
  parseInstallBaseUrl,
  resolveDisplayedInstallCommand,
} from './install-command'

const revealed = {
  licenseId: 'license-id',
  licenseToken: 'token',
  installCommand: 'curl -fsSL turbopanel.sh | TURBOPANEL_LICENSE=abc sh',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseInstallBaseUrl', () => {
  it('accepts https origins and rejects plaintext http', () => {
    expect(parseInstallBaseUrl('https://panel.example.com')).toBe('https://panel.example.com')
    expect(parseInstallBaseUrl('http://dev.example.com')).toBeNull()
  })

  it('rejects paths, query strings, credentials, and shell metacharacters', () => {
    expect(parseInstallBaseUrl('https://panel.example.com/admin')).toBeNull()
    expect(parseInstallBaseUrl('https://panel.example.com?x=1')).toBeNull()
    expect(parseInstallBaseUrl('https://panel.example.com#frag')).toBeNull()
    expect(parseInstallBaseUrl('https://user:pass@panel.example.com')).toBeNull()
    expect(parseInstallBaseUrl('https://panel.example.com; curl http://evil')).toBeNull()
    expect(parseInstallBaseUrl('https://panel.example.com/$(id)')).toBeNull()
    expect(parseInstallBaseUrl('ftp://panel.example.com')).toBeNull()
  })

  it('accepts IPv6 bracket hosts', () => {
    expect(parseInstallBaseUrl('https://[2001:db8::1]:8443')).toBe('https://[2001:db8::1]:8443')
  })

  it('accepts host-only values and strips a trailing slash', () => {
    expect(parseInstallBaseUrl('panel.example.com')).toBe('https://panel.example.com')
    expect(parseInstallBaseUrl('https://panel.example.com/')).toBe('https://panel.example.com')
  })

  it('rejects blank values, a null hostname, and unparseable input', () => {
    expect(parseInstallBaseUrl(undefined)).toBeNull()
    expect(parseInstallBaseUrl('   ')).toBeNull()
    expect(parseInstallBaseUrl('https://null')).toBeNull()
    expect(parseInstallBaseUrl('https://[not-valid')).toBeNull()
  })
})

describe('defaultDevInstallBaseUrl', () => {
  it('prefers the managed URL that matches the browser origin', () => {
    vi.stubGlobal('location', {
      origin: 'https://studio.lan:8443',
      hostname: 'studio.lan',
    })
    expect(defaultDevInstallBaseUrl(['https://other.lan:8443', 'https://studio.lan:8443'])).toBe(
      'https://studio.lan:8443'
    )
  })

  it('falls back to the first https managed URL, then host-derived https', () => {
    expect(defaultDevInstallBaseUrl(['https://huey.lan:8443', 'https://other.lan:8443'])).toBe(
      'https://huey.lan:8443'
    )
    expect(defaultDevInstallBaseUrl(['http://huey.lan'])).toBe('https://huey.lan:8443')
  })

  it('uses the browser origin when no managed URLs are provided', () => {
    vi.stubGlobal('location', {
      origin: 'https://dev.example.com:8443',
      hostname: 'dev.example.com',
    })
    expect(defaultDevInstallBaseUrl()).toBe('https://dev.example.com:8443')
    expect(defaultDevInstallBaseUrl([])).toBe('https://dev.example.com:8443')
  })

  it('falls back to localhost HTTPS when nothing else is available', () => {
    expect(defaultDevInstallBaseUrl()).toBe('https://localhost:8443')
  })

  it('ignores a plaintext browser origin and uses the https managed URL', () => {
    vi.stubGlobal('location', {
      origin: 'http://studio.lan',
      hostname: 'studio.lan',
    })
    expect(defaultDevInstallBaseUrl(['https://studio.lan:8443'])).toBe('https://studio.lan:8443')
  })

  it('skips blank and invalid managed URLs when picking https', () => {
    expect(defaultDevInstallBaseUrl(['', '  ', 'not a url', 'https://huey.lan:8443'])).toBe(
      'https://huey.lan:8443'
    )
  })

  it('ignores a browser origin that does not match any managed URL', () => {
    vi.stubGlobal('location', {
      origin: 'https://other.lan:8443',
      hostname: 'other.lan',
    })
    expect(defaultDevInstallBaseUrl(['  ', 'not a url', 'https://huey.lan:8443'])).toBe(
      'https://huey.lan:8443'
    )
  })

  it('uses the browser origin when managed URLs are blank or invalid', () => {
    vi.stubGlobal('location', {
      origin: 'https://dev.example.com:8443',
      hostname: 'dev.example.com',
    })
    expect(defaultDevInstallBaseUrl(['  ', 'not a url'])).toBe('https://dev.example.com:8443')
  })

  it('ignores a null, blank, or unusable browser origin', () => {
    vi.stubGlobal('location', { origin: 'null', hostname: '' })
    expect(defaultDevInstallBaseUrl()).toBe('https://localhost:8443')

    vi.stubGlobal('location', { origin: '  ', hostname: '' })
    expect(defaultDevInstallBaseUrl()).toBe('https://localhost:8443')

    vi.stubGlobal('location', {
      origin: 'https://user:pass@dev.example.com',
      hostname: 'dev.example.com',
    })
    expect(defaultDevInstallBaseUrl()).toBe('https://localhost:8443')
  })
})

describe('defaultDevCaddyHttpsBaseUrl', () => {
  it('derives https://host:8443 from managed URLs or the browser host', () => {
    expect(defaultDevCaddyHttpsBaseUrl(['http://huey.lan'])).toBe('https://huey.lan:8443')
    vi.stubGlobal('location', {
      origin: 'http://dev.example.com',
      hostname: 'dev.example.com',
    })
    expect(defaultDevCaddyHttpsBaseUrl()).toBe('https://dev.example.com:8443')
  })

  it('falls back to localhost HTTPS', () => {
    expect(defaultDevCaddyHttpsBaseUrl()).toBe('https://localhost:8443')
    expect(defaultDevCaddyHttpsBaseUrl(['not a url', '  '])).toBe('https://localhost:8443')
  })

  it('falls through when the browser origin is not a parseable URL', () => {
    vi.stubGlobal('location', {
      origin: '::not-a-url::',
      hostname: 'dev.example.com',
    })
    expect(defaultDevCaddyHttpsBaseUrl()).toBe('https://localhost:8443')
  })

  it('ignores a browser origin whose hostname is null', () => {
    vi.stubGlobal('location', {
      origin: 'https://null',
      hostname: 'null',
    })
    expect(defaultDevCaddyHttpsBaseUrl()).toBe('https://localhost:8443')
  })
})

describe('buildInstallCommandWithBaseUrl', () => {
  const license = {
    licenseId: 'license-id',
    licenseToken: 'token',
  }
  const licenseArg = btoa('license-id:token')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')

  it('forces insecure TLS flags when insecureTls is true', () => {
    const command = buildInstallCommandWithBaseUrl({
      ...license,
      baseUrl: 'https://turbopanel.dev',
      insecureTls: true,
    })
    expect(command).toContain('curl -fsSLk https://turbopanel.dev/run.sh')
    expect(command).toContain('TURBOPANEL_INSECURE_TLS=1')
    expect(command).toContain(`TURBOPANEL_LICENSE=${licenseArg}`)
    expect(command).toContain('TURBOPANEL_HOST=https://turbopanel.dev')
    expect(command).toContain('TURBOPANEL_DL_BASE=https://turbopanel.dev/downloads/daemon')
  })

  it('forces secure curl when insecureTls is false even on :8443', () => {
    const command = buildInstallCommandWithBaseUrl({
      ...license,
      baseUrl: 'https://panel.example.com:8443',
      insecureTls: false,
    })
    expect(command).toContain('curl -fsSL https://panel.example.com:8443/run.sh')
    expect(command).not.toContain('curl -fsSLk')
    expect(command).not.toContain('TURBOPANEL_INSECURE_TLS')
  })

  it('passes an unparseable origin through untouched', () => {
    const command = buildInstallCommandWithBaseUrl({
      ...license,
      baseUrl: 'not a valid origin',
    })
    expect(command).toContain('curl -fsSL not a valid origin/run.sh')
  })

  it('sets insecure TLS for a LAN https origin and still sets DL_BASE + HOST', () => {
    const command = buildInstallCommandWithBaseUrl({
      ...license,
      baseUrl: 'https://dev.example.com:8443/',
    })
    expect(command).toContain('curl -fsSLk https://dev.example.com:8443/run.sh')
    expect(command).toContain('TURBOPANEL_INSECURE_TLS=1')
    expect(command).toContain('TURBOPANEL_HOST=https://dev.example.com:8443')
    expect(command).toContain('TURBOPANEL_DL_BASE=https://dev.example.com:8443/downloads/daemon')
  })
})

describe('resolveDisplayedInstallCommand', () => {
  it('returns the server command when the edited URL is empty', () => {
    expect(resolveDisplayedInstallCommand(revealed, '  ')).toBe(revealed.installCommand)
  })

  it('falls back to the server command for injectable or invalid URLs', () => {
    expect(
      resolveDisplayedInstallCommand(
        revealed,
        'https://panel.example.com; curl http://attacker.example'
      )
    ).toBe(revealed.installCommand)

    expect(
      resolveDisplayedInstallCommand(revealed, 'https://panel.example.com/path with spaces')
    ).toBe(revealed.installCommand)

    expect(resolveDisplayedInstallCommand(revealed, 'https://panel.example.com?x=$(id)')).toBe(
      revealed.installCommand
    )

    expect(resolveDisplayedInstallCommand(revealed, 'https://panel.example.com/`whoami`')).toBe(
      revealed.installCommand
    )
  })

  it('keeps the issued command when the edited origin is a different https URL', () => {
    expect(resolveDisplayedInstallCommand(revealed, 'https://panel.example.com:8443')).toBe(
      revealed.installCommand
    )
    expect(resolveDisplayedInstallCommand(revealed, 'https://turbopanel.dev')).toBe(
      revealed.installCommand
    )
    expect(revealed.installCommand).not.toContain('panel.example.com')
    expect(revealed.installCommand).not.toContain('dev.lan')
  })

  it('does not retarget an issued LAN command to an unchecked alias', () => {
    const issued = {
      ...revealed,
      installCommand:
        'curl -fsSLk https://192.168.1.10:8443/run.sh | TURBOPANEL_HOST=https://192.168.1.10:8443 TURBOPANEL_LICENSE=abc sh',
    }
    const command = resolveDisplayedInstallCommand(issued, 'https://dev.lan:8443')
    expect(command).toBe(issued.installCommand)
    expect(command).toContain('192.168.1.10')
    expect(command).not.toContain('dev.lan')
  })

  it('falls back to the server command for a plaintext install URL', () => {
    expect(resolveDisplayedInstallCommand(revealed, 'http://dev.example.com')).toBe(
      revealed.installCommand
    )
  })
})
