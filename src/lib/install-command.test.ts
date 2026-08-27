import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildInstallCommandWithBaseUrl,
  defaultDevCaddyHttpsBaseUrl,
  defaultDevInstallBaseUrl,
  defaultDevInstallHttpBaseUrl,
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
    expect(parseInstallBaseUrl('https://panel.example.com#frag')).toBeNull()
    expect(
      parseInstallBaseUrl('https://user:pass@panel.example.com'),
    ).toBeNull()
    expect(
      parseInstallBaseUrl('https://panel.example.com; curl http://evil'),
    ).toBeNull()
    expect(
      parseInstallBaseUrl('https://panel.example.com/$(id)'),
    ).toBeNull()
    expect(parseInstallBaseUrl('ftp://panel.example.com')).toBeNull()
  })

  it('accepts IPv6 bracket hosts', () => {
    expect(parseInstallBaseUrl('https://[2001:db8::1]:8443')).toBe(
      'https://[2001:db8::1]:8443',
    )
  })

  it('accepts host-only values and strips a trailing slash', () => {
    expect(parseInstallBaseUrl('panel.example.com')).toBe(
      'https://panel.example.com',
    )
    expect(parseInstallBaseUrl('https://panel.example.com/')).toBe(
      'https://panel.example.com',
    )
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
    expect(
      defaultDevInstallBaseUrl([
        'http://studio.lan:8880',
        'https://studio.lan:8443',
      ]),
    ).toBe('https://studio.lan:8443')
  })

  it('falls back to the first https managed URL, then host-derived https', () => {
    expect(
      defaultDevInstallBaseUrl([
        'http://huey.lan:8880',
        'https://huey.lan:8443',
      ]),
    ).toBe('https://huey.lan:8443')
    expect(defaultDevInstallBaseUrl(['http://huey.lan:8880'])).toBe(
      'https://huey.lan:8443',
    )
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

  it('prefers a managed URL that matches the browser http origin', () => {
    vi.stubGlobal('location', {
      origin: 'http://studio.lan:8880',
      hostname: 'studio.lan',
    })
    expect(
      defaultDevInstallBaseUrl([
        'https://studio.lan:8443',
        'http://studio.lan:8880',
      ]),
    ).toBe('http://studio.lan:8880')
  })

  it('skips blank and invalid managed URLs when picking https', () => {
    expect(
      defaultDevInstallBaseUrl([
        '',
        '  ',
        'not a url',
        'https://huey.lan:8443',
      ]),
    ).toBe('https://huey.lan:8443')
  })

  it('ignores a browser origin that does not match any managed URL', () => {
    vi.stubGlobal('location', {
      origin: 'https://other.lan:8443',
      hostname: 'other.lan',
    })
    expect(
      defaultDevInstallBaseUrl([
        '  ',
        'not a url',
        'https://huey.lan:8443',
      ]),
    ).toBe('https://huey.lan:8443')
  })

  it('uses the browser origin when managed URLs are blank or invalid', () => {
    vi.stubGlobal('location', {
      origin: 'https://dev.example.com:8443',
      hostname: 'dev.example.com',
    })
    expect(defaultDevInstallBaseUrl(['  ', 'not a url'])).toBe(
      'https://dev.example.com:8443',
    )
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
    expect(defaultDevCaddyHttpsBaseUrl(['http://huey.lan:8880'])).toBe(
      'https://huey.lan:8443',
    )
    vi.stubGlobal('location', {
      origin: 'http://dev.example.com:8880',
      hostname: 'dev.example.com',
    })
    expect(defaultDevCaddyHttpsBaseUrl()).toBe('https://dev.example.com:8443')
  })

  it('falls back to localhost HTTPS', () => {
    expect(defaultDevCaddyHttpsBaseUrl()).toBe('https://localhost:8443')
    expect(defaultDevCaddyHttpsBaseUrl(['not a url', '  '])).toBe(
      'https://localhost:8443',
    )
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

describe('defaultDevInstallHttpBaseUrl', () => {
  it('prefers an http managed URL, else derives :8880 from the host', () => {
    expect(
      defaultDevInstallHttpBaseUrl([
        'https://huey.lan:8443',
        'http://huey.lan:8880',
      ]),
    ).toBe('http://huey.lan:8880')
    expect(defaultDevInstallHttpBaseUrl(['https://huey.lan:8443'])).toBe(
      'http://huey.lan:8880',
    )
  })

  it('uses the browser hostname when no managed URLs are provided', () => {
    vi.stubGlobal('location', {
      origin: 'https://dev.example.com:8443',
      hostname: 'dev.example.com',
    })
    expect(defaultDevInstallHttpBaseUrl()).toBe('http://dev.example.com:8880')
  })

  it('falls back to localhost HTTP', () => {
    expect(defaultDevInstallHttpBaseUrl()).toBe('http://localhost:8880')
  })

  it('skips blank and invalid managed URLs when picking http', () => {
    expect(
      defaultDevInstallHttpBaseUrl([
        '',
        '  ',
        'not a url',
        'http://huey.lan:8880',
      ]),
    ).toBe('http://huey.lan:8880')
  })

  it('falls back to localhost HTTP when the browser hostname is unusable', () => {
    vi.stubGlobal('location', {
      origin: 'https://null',
      hostname: 'null',
    })
    expect(defaultDevInstallHttpBaseUrl()).toBe('http://localhost:8880')
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
    expect(command).toContain(
      'TURBOPANEL_DL_BASE=https://turbopanel.dev/downloads/daemon',
    )
  })

  it('forces secure curl when insecureTls is false even on :8443', () => {
    const command = buildInstallCommandWithBaseUrl({
      ...license,
      baseUrl: 'https://panel.example.com:8443',
      insecureTls: false,
    })
    expect(command).toContain(
      'curl -fsSL https://panel.example.com:8443/run.sh',
    )
    expect(command).not.toContain('curl -fsSLk')
    expect(command).not.toContain('TURBOPANEL_INSECURE_TLS')
  })

  it('uses the bare turbopanel.sh curl target for the CDN origin', () => {
    const command = buildInstallCommandWithBaseUrl({
      ...license,
      baseUrl: 'https://turbopanel.sh',
    })
    expect(command).toContain('curl -fsSL turbopanel.sh |')
    expect(command).not.toContain('turbopanel.sh/run.sh')
    expect(command).toContain(
      'TURBOPANEL_DL_BASE=https://turbopanel.sh/downloads/daemon',
    )

    const bareHost = buildInstallCommandWithBaseUrl({
      ...license,
      baseUrl: 'turbopanel.sh',
    })
    expect(bareHost).toContain('curl -fsSL turbopanel.sh |')
  })

  it('uses the bare turbopanel.sh target for http and default ports', () => {
    const httpOrigin = buildInstallCommandWithBaseUrl({
      ...license,
      baseUrl: 'http://turbopanel.sh',
    })
    expect(httpOrigin).toContain('curl -fsSL turbopanel.sh |')
    expect(httpOrigin).not.toContain('turbopanel.sh/run.sh')

    const https443 = buildInstallCommandWithBaseUrl({
      ...license,
      baseUrl: 'https://turbopanel.sh:443',
    })
    expect(https443).toContain('curl -fsSL turbopanel.sh |')

    const http80 = buildInstallCommandWithBaseUrl({
      ...license,
      baseUrl: 'http://turbopanel.sh:80',
    })
    expect(http80).toContain('curl -fsSL turbopanel.sh |')
  })

  it('does not treat non-default ports, paths, or other hosts as the CDN', () => {
    expect(
      buildInstallCommandWithBaseUrl({
        ...license,
        baseUrl: 'https://turbopanel.sh:8443',
      }),
    ).toContain('https://turbopanel.sh:8443/run.sh')

    expect(
      buildInstallCommandWithBaseUrl({
        ...license,
        baseUrl: 'https://turbopanel.sh/extra',
      }),
    ).toContain('https://turbopanel.sh/extra/run.sh')

    expect(
      buildInstallCommandWithBaseUrl({
        ...license,
        baseUrl: 'https://turbopanel.sh?x=1',
      }),
    ).toContain('https://turbopanel.sh?x=1/run.sh')

    expect(
      buildInstallCommandWithBaseUrl({
        ...license,
        baseUrl: 'https://turbopanel.sh#frag',
      }),
    ).toContain('https://turbopanel.sh#frag/run.sh')

    expect(
      buildInstallCommandWithBaseUrl({
        ...license,
        baseUrl: 'ftp://turbopanel.sh',
      }),
    ).toContain('ftp://turbopanel.sh/run.sh')
  })

  it('does not treat an unparseable origin as turbopanel.sh', () => {
    const command = buildInstallCommandWithBaseUrl({
      ...license,
      baseUrl: 'not a valid origin',
    })
    expect(command).toContain('curl -fsSL not a valid origin/run.sh')
    expect(command).not.toContain('curl -fsSL turbopanel.sh |')
  })

  it('omits insecure TLS for plaintext HTTP and still sets DL_BASE + HOST', () => {
    const command = buildInstallCommandWithBaseUrl({
      ...license,
      baseUrl: 'http://dev.example.com:8880/',
    })
    expect(command).toContain('curl -fsSL http://dev.example.com:8880/run.sh')
    expect(command).not.toContain('TURBOPANEL_INSECURE_TLS')
    expect(command).toContain('TURBOPANEL_HOST=http://dev.example.com:8880')
    expect(command).toContain(
      'TURBOPANEL_DL_BASE=http://dev.example.com:8880/downloads/daemon',
    )
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
    expect(command).toContain(
      'TURBOPANEL_DL_BASE=https://panel.example.com:8443/downloads/daemon',
    )
    expect(command).not.toContain("'")
  })

  it('omits insecure TLS for publicly trusted HTTPS on 443', () => {
    const command = resolveDisplayedInstallCommand(
      revealed,
      'https://turbopanel.dev',
    )
    expect(command).toContain('curl -fsSL https://turbopanel.dev/run.sh')
    expect(command).not.toContain('curl -fsSLk')
    expect(command).not.toContain('TURBOPANEL_INSECURE_TLS')
    expect(command).toContain(
      'TURBOPANEL_DL_BASE=https://turbopanel.dev/downloads/daemon',
    )
  })

  it('emits unquoted validated HTTP origins without insecure TLS flags', () => {
    const command = resolveDisplayedInstallCommand(
      revealed,
      'http://dev.example.com:8880',
    )
    expect(command).toContain('curl -fsSL http://dev.example.com:8880/run.sh')
    expect(command).not.toContain('curl -fsSLk')
    expect(command).not.toContain('TURBOPANEL_INSECURE_TLS')
    expect(command).toContain(
      'TURBOPANEL_DL_BASE=http://dev.example.com:8880/downloads/daemon',
    )
    expect(command).not.toContain("'")
  })
})
