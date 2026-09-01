import { describe, expect, it } from 'vitest'
import {
  collectHostingExtensionValidationIssues,
  DEFAULT_HOSTING_BIND_SCOPE,
  DEFAULT_HOSTING_PATH_PREFIX,
  DEFAULT_HOSTING_TLS_MODE,
  hostingBindScopeOf,
  HOSTING_HOSTNAME_MAX_LENGTH,
  hostingIpRefUnresolvedMessage,
  HOSTING_PATH_PREFIX_MAX_LENGTH,
  HOSTING_REF_MAX_LENGTH,
  HOSTING_TARGET_PORT_NOT_FOR_NODE_MESSAGE,
  HOSTING_TARGET_PORT_NOT_FOR_SITE_MESSAGE,
  HOSTING_TARGET_PORT_RANGE_MESSAGE,
  HOSTING_TLS_MODE_AUTOMATIC_UNSUPPORTED_MESSAGE,
  hostingTargetPortAuthorable,
  hostingTlsModeOf,
  hostingTlsRefUnresolvedMessage,
  parseHostingExtensionEntries,
  readHostingHostname,
  readHostingPathPrefix,
} from './hosting-extension'
import type { ComposeServiceKind } from './service-kind'

const BASE = 'services.web.x-turbopanel'

function issuesFor(
  entry: Record<string, unknown>,
  serviceKind?: ComposeServiceKind,
) {
  return collectHostingExtensionValidationIssues(BASE, [entry], serviceKind)
}

/**
 * The editor must say exactly what the instance's save would say — these are
 * the two rules that changed shape, so they are the two worth pinning here.
 */
describe('hosting extension rules mirrored from the instance', () => {
  it('defaults an omitted tls block to internal', () => {
    expect(DEFAULT_HOSTING_TLS_MODE).toBe('internal')
    expect(hostingTlsModeOf({ hostname: 'app.example.com' })).toBe('internal')
  })

  it('refuses tls.mode automatic rather than blessing a self-signed deploy', () => {
    expect(issuesFor({ hostname: 'app.example.com', tls: { mode: 'automatic' } }))
      .toEqual([{
        path: `${BASE}.hosting[0].tls.mode`,
        message: HOSTING_TLS_MODE_AUTOMATIC_UNSUPPORTED_MESSAGE,
      }])
  })

  it('accepts internal and certificate', () => {
    expect(issuesFor({ hostname: 'a.example.com', tls: { mode: 'internal' } }))
      .toEqual([])
    expect(
      issuesFor({
        hostname: 'a.example.com',
        tls: { mode: 'certificate', certificateRef: 'wildcard' },
      }),
    ).toEqual([])
  })

  it('allows targetPort only on a container', () => {
    expect(hostingTargetPortAuthorable('container')).toBe(true)
    expect(hostingTargetPortAuthorable(undefined)).toBe(true)
    expect(hostingTargetPortAuthorable('site')).toBe(false)
    expect(hostingTargetPortAuthorable('node')).toBe(false)
  })

  it('refuses targetPort on node and site with their own messages', () => {
    expect(issuesFor({ hostname: 'a.example.com', targetPort: 3000 }, 'node'))
      .toEqual([{
        path: `${BASE}.hosting[0].targetPort`,
        message: HOSTING_TARGET_PORT_NOT_FOR_NODE_MESSAGE,
      }])
    expect(issuesFor({ hostname: 'a.example.com', targetPort: 8080 }, 'site'))
      .toEqual([{
        path: `${BASE}.hosting[0].targetPort`,
        message: HOSTING_TARGET_PORT_NOT_FOR_SITE_MESSAGE,
      }])
    expect(issuesFor({ hostname: 'a.example.com', targetPort: 8080 }, 'container'))
      .toEqual([])
  })
})

describe('unresolved reference messages', () => {
  it('names the certificate that was not found', () => {
    expect(hostingTlsRefUnresolvedMessage('wildcard')).toBe(
      "certificate 'wildcard' was not found for this organization",
    )
  })

  it('names the ip that was not found', () => {
    expect(hostingIpRefUnresolvedMessage('ip-1')).toBe(
      "ip 'ip-1' was not found for this organization",
    )
  })
})

describe('readHostingHostname', () => {
  it('rejects non-strings, blank, and over-length values', () => {
    expect(readHostingHostname(42)).toBeUndefined()
    expect(readHostingHostname('   ')).toBeUndefined()
    expect(readHostingHostname('a'.repeat(HOSTING_HOSTNAME_MAX_LENGTH + 1)))
      .toBeUndefined()
  })

  it('lowercases a valid hostname', () => {
    expect(readHostingHostname('APP.Example.com')).toBe('app.example.com')
  })

  it('rejects a malformed hostname', () => {
    expect(readHostingHostname('not a host!')).toBeUndefined()
  })
})

describe('readHostingPathPrefix', () => {
  it('rejects non-strings, blank, and over-length values', () => {
    expect(readHostingPathPrefix(1)).toBeUndefined()
    expect(readHostingPathPrefix('   ')).toBeUndefined()
    expect(readHostingPathPrefix('/'.repeat(HOSTING_PATH_PREFIX_MAX_LENGTH + 1)))
      .toBeUndefined()
  })

  it('requires a leading slash', () => {
    expect(readHostingPathPrefix('api')).toBeUndefined()
  })

  it('rejects traversal and whitespace', () => {
    expect(readHostingPathPrefix('/api/../secret')).toBeUndefined()
    expect(readHostingPathPrefix('/api foo')).toBeUndefined()
  })

  it('accepts a clean absolute prefix', () => {
    expect(readHostingPathPrefix('/api')).toBe('/api')
  })
})

describe('hostingBindScopeOf', () => {
  it('defaults an omitted bind to public', () => {
    expect(DEFAULT_HOSTING_BIND_SCOPE).toBe('public')
    expect(hostingBindScopeOf({ hostname: 'app.example.com' })).toBe('public')
  })

  it('reads an explicit scope', () => {
    expect(
      hostingBindScopeOf({
        hostname: 'app.example.com',
        bind: { scope: 'local' },
      }),
    ).toBe('local')
  })
})

describe('parseHostingExtensionEntries', () => {
  it('returns undefined for a non-array or empty result', () => {
    expect(parseHostingExtensionEntries('nope')).toBeUndefined()
    expect(parseHostingExtensionEntries([{ pathPrefix: '/api' }])).toBeUndefined()
  })

  it('drops malformed entries and keeps well-formed ones', () => {
    expect(
      parseHostingExtensionEntries([
        'not-a-mapping',
        { hostname: 'app.example.com' },
      ]),
    ).toEqual([{ hostname: 'app.example.com' }])
  })

  it('parses tls and bind specs, dropping mismatched refs', () => {
    expect(
      parseHostingExtensionEntries([{
        hostname: 'app.example.com',
        pathPrefix: '/api',
        targetPort: 8080,
        forceHttps: false,
        tls: { mode: 'certificate', certificateRef: 'wildcard' },
        bind: { scope: 'local', ipRef: 'ip-1' },
      }]),
    ).toEqual([{
      hostname: 'app.example.com',
      pathPrefix: '/api',
      targetPort: 8080,
      forceHttps: false,
      tls: { mode: 'certificate', certificateRef: 'wildcard' },
      bind: { scope: 'local', ipRef: 'ip-1' },
    }])

    // certificateRef only survives when mode is "certificate"
    expect(
      parseHostingExtensionEntries([{
        hostname: 'app.example.com',
        tls: { mode: 'internal', certificateRef: 'wildcard' },
      }]),
    ).toEqual([{ hostname: 'app.example.com', tls: { mode: 'internal' } }])

    // an unrecognized tls/bind shape is dropped entirely
    expect(
      parseHostingExtensionEntries([{
        hostname: 'app.example.com',
        tls: { mode: 'bogus' },
        bind: { scope: 'bogus' },
      }]),
    ).toEqual([{ hostname: 'app.example.com' }])
  })

  it('dedupes entries sharing a (hostname, pathPrefix) identity', () => {
    expect(
      parseHostingExtensionEntries([
        { hostname: 'app.example.com', pathPrefix: '/api' },
        { hostname: 'app.example.com', pathPrefix: '/api' },
        { hostname: 'app.example.com' },
      ]),
    ).toEqual([
      { hostname: 'app.example.com', pathPrefix: '/api' },
      { hostname: 'app.example.com' },
    ])
  })

  it('caps the number of parsed entries', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      hostname: `svc-${i}.example.com`,
    }))
    expect(parseHostingExtensionEntries(many)).toHaveLength(20)
  })
})

describe('collectHostingExtensionValidationIssues structural errors', () => {
  it('passes through an omitted hosting block', () => {
    expect(collectHostingExtensionValidationIssues(BASE, null, undefined))
      .toEqual([])
    expect(collectHostingExtensionValidationIssues(BASE, undefined, undefined))
      .toEqual([])
  })

  it('reports a non-array value', () => {
    expect(collectHostingExtensionValidationIssues(BASE, 'nope', undefined))
      .toEqual([{
        path: `${BASE}.hosting`,
        message: 'hosting must be a list of ingress entries',
      }])
  })

  it('reports too many entries without inspecting them', () => {
    const many = Array.from({ length: 21 }, () => ({}))
    expect(collectHostingExtensionValidationIssues(BASE, many, undefined))
      .toEqual([{
        path: `${BASE}.hosting`,
        message: 'hosting must declare at most 20 entries',
      }])
  })

  it('reports a non-mapping entry', () => {
    expect(collectHostingExtensionValidationIssues(BASE, ['nope'], undefined))
      .toEqual([{
        path: `${BASE}.hosting[0]`,
        message: 'hosting entry must be a mapping',
      }])
  })

  it('reports a duplicate (hostname, pathPrefix) pair', () => {
    expect(
      collectHostingExtensionValidationIssues(
        BASE,
        [
          { hostname: 'app.example.com', pathPrefix: '/api' },
          { hostname: 'app.example.com', pathPrefix: '/api' },
        ],
        undefined,
      ),
    ).toEqual([{
      path: `${BASE}.hosting[1]`,
      message:
        `hosting already declares app.example.com/api on this service; one route is one entry`,
    }])
  })

  it('reports a duplicate default-path pair using the default prefix', () => {
    expect(
      collectHostingExtensionValidationIssues(
        BASE,
        [{ hostname: 'app.example.com' }, { hostname: 'app.example.com' }],
        undefined,
      ),
    ).toEqual([{
      path: `${BASE}.hosting[1]`,
      message:
        `hosting already declares app.example.com${DEFAULT_HOSTING_PATH_PREFIX} on this service; one route is one entry`,
    }])
  })

  it('skips the duplicate check when hostname is missing', () => {
    expect(
      collectHostingExtensionValidationIssues(BASE, [{}, {}], undefined),
    ).toEqual([
      {
        path: `${BASE}.hosting[0].hostname`,
        message: expect.stringContaining('hostname is required'),
      },
      {
        path: `${BASE}.hosting[1].hostname`,
        message: expect.stringContaining('hostname is required'),
      },
    ])
  })
})

describe('collectHostingExtensionValidationIssues entry-level rules', () => {
  it('redirects a known misplaced key and reports an unknown one generically', () => {
    expect(issuesFor({ hostname: 'app.example.com', ports: ['80:80'] }))
      .toEqual([{
        path: `${BASE}.hosting[0].ports`,
        message: expect.stringContaining('not a port publish'),
      }])
    expect(issuesFor({ hostname: 'app.example.com', bogus: true }))
      .toEqual([{
        path: `${BASE}.hosting[0].bogus`,
        message: expect.stringContaining('unknown hosting key "bogus"; supported:'),
      }])
  })

  it('reports an invalid pathPrefix and forceHttps', () => {
    expect(issuesFor({ hostname: 'app.example.com', pathPrefix: 'api' }))
      .toEqual([{
        path: `${BASE}.hosting[0].pathPrefix`,
        message: expect.stringContaining('pathPrefix must start with'),
      }])
    expect(issuesFor({ hostname: 'app.example.com', forceHttps: 'yes' }))
      .toEqual([{
        path: `${BASE}.hosting[0].forceHttps`,
        message: 'forceHttps must be true or false',
      }])
  })

  it('reports an out-of-range targetPort on an authorable kind', () => {
    expect(
      issuesFor({ hostname: 'app.example.com', targetPort: 0 }, 'container'),
    ).toEqual([{
      path: `${BASE}.hosting[0].targetPort`,
      message: HOSTING_TARGET_PORT_RANGE_MESSAGE,
    }])
  })
})

describe('collectHostingExtensionValidationIssues tls rules', () => {
  it('reports a non-mapping tls block', () => {
    expect(issuesFor({ hostname: 'app.example.com', tls: 'nope' }))
      .toEqual([{ path: `${BASE}.hosting[0].tls`, message: 'tls must be a mapping' }])
  })

  it('redirects a known key and reports an unknown one generically', () => {
    expect(
      issuesFor({
        hostname: 'app.example.com',
        tls: { mode: 'internal', certificate: 'inline-pem' },
      }),
    ).toEqual([{
      path: `${BASE}.hosting[0].tls.certificate`,
      message: expect.stringContaining('certificate is not authored in compose'),
    }])
    expect(
      issuesFor({
        hostname: 'app.example.com',
        tls: { mode: 'internal', bogus: true },
      }),
    ).toEqual([{
      path: `${BASE}.hosting[0].tls.bogus`,
      message: expect.stringContaining('unknown tls key "bogus"; supported:'),
    }])
  })

  it('reports an invalid tls.mode', () => {
    expect(issuesFor({ hostname: 'app.example.com', tls: { mode: 'bogus' } }))
      .toEqual([{
        path: `${BASE}.hosting[0].tls.mode`,
        message: 'tls.mode must be "automatic", "internal", or "certificate"',
      }])
  })

  it('requires certificateRef when mode is certificate', () => {
    expect(issuesFor({ hostname: 'app.example.com', tls: { mode: 'certificate' } }))
      .toEqual([{
        path: `${BASE}.hosting[0].tls.certificateRef`,
        message: expect.stringContaining('tls.certificateRef is required'),
      }])
  })

  it('rejects certificateRef when mode is not certificate', () => {
    expect(
      issuesFor({
        hostname: 'app.example.com',
        tls: { mode: 'internal', certificateRef: 'wildcard' },
      }),
    ).toEqual([{
      path: `${BASE}.hosting[0].tls.certificateRef`,
      message: 'tls.certificateRef is only valid when tls.mode is "certificate"',
    }])
  })
})

describe('collectHostingExtensionValidationIssues bind rules', () => {
  it('reports a non-mapping bind block', () => {
    expect(issuesFor({ hostname: 'app.example.com', bind: 'nope' }))
      .toEqual([{ path: `${BASE}.hosting[0].bind`, message: 'bind must be a mapping' }])
  })

  it('redirects a known key and reports an unknown one generically', () => {
    expect(
      issuesFor({
        hostname: 'app.example.com',
        bind: { scope: 'public', ip: '10.0.0.1' },
      }),
    ).toEqual([{
      path: `${BASE}.hosting[0].bind.ip`,
      message: expect.stringContaining('name a managed address with bind.ipRef'),
    }])
    expect(
      issuesFor({
        hostname: 'app.example.com',
        bind: { scope: 'public', bogus: true },
      }),
    ).toEqual([{
      path: `${BASE}.hosting[0].bind.bogus`,
      message: expect.stringContaining('unknown bind key "bogus"; supported:'),
    }])
  })

  it('reports an invalid bind.scope', () => {
    expect(issuesFor({ hostname: 'app.example.com', bind: { scope: 'bogus' } }))
      .toEqual([{
        path: `${BASE}.hosting[0].bind.scope`,
        message: 'bind.scope must be "public", "datacenter", or "local"',
      }])
  })

  it('reports an over-length bind.ipRef', () => {
    expect(
      issuesFor({
        hostname: 'app.example.com',
        bind: { scope: 'public', ipRef: 'x'.repeat(HOSTING_REF_MAX_LENGTH + 1) },
      }),
    ).toEqual([{
      path: `${BASE}.hosting[0].bind.ipRef`,
      message: expect.stringContaining('bind.ipRef must name a managed address'),
    }])
  })
})
