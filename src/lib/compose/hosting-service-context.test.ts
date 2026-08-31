import { describe, expect, it } from 'vitest'
import { yamlToComposeDocument } from './convert'
import {
  findComposeHostingEntryIndex,
  hostingDockerBridgeHint,
  hostingPathPrefixHint,
  hostingPhpSectionCopy,
  hostingServiceKindLabel,
  hostingTargetPortHint,
  hostingWebEnvSectionCopy,
  readComposeHostingEntries,
  readComposeServiceMap,
  resolveHostingServiceContext,
  shouldRevealOptionalHostingFields,
  siteEnvKeyForService,
  writeComposeHostingEntries,
} from './hosting-service-context'
import type { ComposeDocument } from './types'

describe('siteEnvKeyForService', () => {
  it('sanitizes compose service names like the daemon', () => {
    expect(siteEnvKeyForService('my-app')).toBe(
      'TURBOPANEL_SITE_MY_APP_URL',
    )
    expect(siteEnvKeyForService('2web')).toBe(
      'TURBOPANEL_SITE__2WEB_URL',
    )
  })
})

describe('resolveHostingServiceContext', () => {
  it('detects Apache site and PHP applicability', () => {
    const document = yamlToComposeDocument(`services:
  api:
    x-turbopanel:
      serviceKind: site
      engine: apache
      root: public
  static:
    x-turbopanel:
      serviceKind: site
      engine: nginx
      root: public
`)

    const apache = resolveHostingServiceContext(document, 'api')
    expect(apache.kind).toBe('site')
    expect(apache.engine).toBe('apache')
    expect(apache.phpApplicability).toBe('applicable')
    expect(apache.webEnvMode).toBe('apache_setenv')
    expect(apache.siteSiblingNames).toEqual(['static'])
    expect(hostingServiceKindLabel(apache)).toBe('Site · Apache')
    expect(hostingPhpSectionCopy(apache).showFields).toBe(true)
    expect(hostingPhpSectionCopy(apache).hint).toContain('mod_proxy_fcgi')
    expect(hostingWebEnvSectionCopy(apache).showFields).toBe(true)
  })

  it('offers PHP on every site engine, naming each mechanism', () => {
    const document = yamlToComposeDocument(`services:
  static:
    x-turbopanel:
      serviceKind: site
      engine: nginx
  site:
    x-turbopanel:
      serviceKind: site
      engine: openlitespeed
`)

    const nginx = resolveHostingServiceContext(document, 'static')
    expect(nginx.phpApplicability).toBe('applicable')
    expect(nginx.webEnvMode).toBe('file_only')
    expect(hostingPhpSectionCopy(nginx).showFields).toBe(true)
    expect(hostingPhpSectionCopy(nginx).title).toBe('PHP settings (nginx php-fpm)')
    expect(hostingPhpSectionCopy(nginx).hint).toContain('fastcgi_pass')
    expect(hostingServiceKindLabel(nginx)).toBe('Site · nginx')
    expect(hostingWebEnvSectionCopy(nginx).showFields).toBe(true)
    expect(hostingWebEnvSectionCopy(nginx).hint).toContain('nginx does not inject')

    const ols = resolveHostingServiceContext(document, 'site')
    expect(ols.phpApplicability).toBe('applicable')
    expect(hostingPhpSectionCopy(ols).showFields).toBe(true)
    expect(hostingPhpSectionCopy(ols).title).toBe('PHP settings (OpenLiteSpeed LSAPI)')
    expect(hostingPhpSectionCopy(ols).hint).toContain('suEXEC')

    // web.env stays Apache-only — PHP parity did not change SetEnv support.
    expect(ols.webEnvMode).toBe('ignored')
    expect(hostingWebEnvSectionCopy(ols).showFields).toBe(false)
  })

  it('surfaces docker bridge env hint for containers next to site', () => {
    const document = yamlToComposeDocument(`services:
  app:
    image: node:22
  php:
    x-turbopanel:
      serviceKind: site
      engine: apache
`)

    const container = resolveHostingServiceContext(document, 'app')
    expect(container.kind).toBe('container')
    expect(container.phpApplicability).toBe('not_applicable')
    expect(container.webEnvMode).toBe('container_variables')
    const hint = hostingDockerBridgeHint(container)
    expect(hint).toContain('TURBOPANEL_SITE_PHP_URL')
    expect(hint).toContain('TURBOPANEL_SITE_ENDPOINTS')
    expect(hostingDockerBridgeHint(resolveHostingServiceContext(document, 'php'))).toBeNull()
  })
})

describe('node services are their own kind', () => {
  const document = yamlToComposeDocument(`services:
  app:
    x-turbopanel:
      serviceKind: node
      source:
        sourceId: 11111111-2222-3333-4444-555555555555
  api:
    image: node:22
  blog:
    x-turbopanel:
      serviceKind: site
      engine: caddy
`)

  it('resolves a node service as node, not container', () => {
    // The regression: every non-site service used to resolve as `container`,
    // so a native app inherited container rules — most visibly `targetPort`,
    // which the panel offered and wrote for a kind the control plane refuses
    // it on.
    expect(resolveHostingServiceContext(document, 'app').kind).toBe('node')
    expect(resolveHostingServiceContext(document, 'api').kind).toBe('container')
    expect(resolveHostingServiceContext(document, 'blog').kind).toBe('site')
  })

  it('labels the native node lane and describes who owns the port', () => {
    const node = resolveHostingServiceContext(document, 'app')
    expect(hostingServiceKindLabel(node)).toBe('Node app')
    const hint = hostingTargetPortHint(node)
    expect(hint).toContain('systemd')
    expect(hint).toContain('PORT')
    // A site is answered by an engine vhost, not a supervised process — the
    // hint names which, so the field reads as already decided rather than
    // missing.
    expect(hostingTargetPortHint(resolveHostingServiceContext(document, 'blog')))
      .toContain('Caddy')
    // A container keeps the field, so it has nothing to say in its place.
    expect(hostingTargetPortHint(resolveHostingServiceContext(document, 'api')))
      .toBeNull()
  })

  it('offers neither PHP nor container-variable advice for a node service', () => {
    const node = resolveHostingServiceContext(document, 'app')
    expect(node.phpApplicability).toBe('not_applicable')
    expect(hostingPhpSectionCopy(node).showFields).toBe(false)
    expect(node.webEnvMode).toBe('node_unit_environment')
    const copy = hostingWebEnvSectionCopy(node)
    expect(copy.showFields).toBe(false)
    expect(copy.hint).toContain('host-supervised process')
    // Not a container, so the docker bridge advice would point at a control
    // that cannot reach the process.
    expect(hostingDockerBridgeHint(node)).toBeNull()
  })
})

describe('shouldRevealOptionalHostingFields', () => {
  it('reveals hidden fields only when stored values exist', () => {
    expect(shouldRevealOptionalHostingFields(false, false)).toBe(false)
    expect(shouldRevealOptionalHostingFields(false, true)).toBe(true)
    expect(shouldRevealOptionalHostingFields(true, false)).toBe(true)
  })
})

describe('readComposeServiceMap', () => {
  it('skips non-object service entries', () => {
    const document: ComposeDocument = {
      version: 1,
      data: {
        services: {
          valid: { image: 'nginx' },
          invalid: 'not-a-map',
        },
      },
      presentation: { keyOrder: [], comments: {} },
    }
    expect(readComposeServiceMap(document)).toEqual({
      valid: { image: 'nginx' },
    })
    expect(readComposeServiceMap({ ...document, data: {} })).toEqual({})
  })
})

describe('resolveHostingServiceContext edge cases', () => {
  it('defaults missing services to container context', () => {
    const document = yamlToComposeDocument(`services:
  web:
    image: nginx
`)
    const missing = resolveHostingServiceContext(document, 'missing')
    expect(missing.kind).toBe('container')
    expect(missing.engine).toBeUndefined()
    expect(missing.siteSiblingNames).toEqual([])
    expect(hostingServiceKindLabel(missing)).toBe('Container')
    expect(hostingPhpSectionCopy(missing).showFields).toBe(false)
    expect(hostingWebEnvSectionCopy(missing).showFields).toBe(false)
    expect(hostingDockerBridgeHint(missing)).toBeNull()
  })

  it('defaults a site without an explicit engine to caddy', () => {
    // Mirrors DEFAULT_SITE_ENGINE in the instance's lib/compose/site.ts, which
    // is where the default is actually resolved before the wire.
    const document = yamlToComposeDocument(`services:
  site:
    x-turbopanel:
      serviceKind: site
      root: public
`)
    const nginx = resolveHostingServiceContext(document, 'site')
    expect(nginx.engine).toBe('caddy')
    expect(nginx.webEnvMode).toBe('caddy_env')
    expect(hostingServiceKindLabel(nginx)).toBe('Site · Caddy')
    expect(hostingPhpSectionCopy(nginx).showFields).toBe(true)
    expect(hostingWebEnvSectionCopy(nginx).showFields).toBe(true)
  })
})

describe('hosting copy helpers', () => {
  it('lists siblings in the path-prefix hint when present', () => {
    const withSiblings = resolveHostingServiceContext(
      yamlToComposeDocument(`services:
  api:
    x-turbopanel:
      serviceKind: site
      engine: apache
  static:
    x-turbopanel:
      serviceKind: site
      engine: nginx
`),
      'api',
    )
    expect(hostingPathPrefixHint(withSiblings)).toContain('static')
    expect(hostingPathPrefixHint(withSiblings)).not.toContain('static nginx')

    const alone = resolveHostingServiceContext(
      yamlToComposeDocument(`services:
  api:
    x-turbopanel:
      serviceKind: site
      engine: apache
`),
      'api',
    )
    expect(hostingPathPrefixHint(alone)).not.toContain('Other site')
  })

  it('covers container PHP and web-env copy branches', () => {
    const container = resolveHostingServiceContext(
      yamlToComposeDocument(`services:
  app:
    image: node:22
`),
      'app',
    )
    expect(hostingPhpSectionCopy(container).title).toBe('PHP settings')
    expect(hostingPhpSectionCopy(container).hint).toContain('Containers use their image runtime')
    expect(hostingWebEnvSectionCopy(container).hint).toContain('Hosting variables')
  })

  it('labels a site with no engine as a generic site', () => {
    expect(
      hostingServiceKindLabel({
        composeServiceName: 'web',
        kind: 'site',
        engine: undefined,
        siteSiblingNames: [],
        phpApplicability: 'applicable',
        webEnvMode: 'file_only',
        composeHostingEntries: [],
      }),
    ).toBe('Site · site')
  })
})

describe('caddy site engine', () => {
  it('labels a caddy site and keeps PHP applicable', () => {
    const doc = yamlToComposeDocument(`services:
  web:
    x-turbopanel:
      serviceKind: site
      engine: caddy
`)
    const ctx = resolveHostingServiceContext(doc, 'web')
    expect(ctx.kind).toBe('site')
    expect(ctx.engine).toBe('caddy')
    expect(hostingServiceKindLabel(ctx)).toBe('Site · Caddy')
  })

  it('defaults a site with no engine to caddy', () => {
    // `engine` is optional; the instance resolves the same default at the
    // split so the wire always carries an explicit engine.
    const doc = yamlToComposeDocument(`services:
  web:
    x-turbopanel:
      serviceKind: site
`)
    const ctx = resolveHostingServiceContext(doc, 'web')
    expect(ctx.engine).toBe('caddy')
  })
})

describe('compose-authored hosting entries', () => {
  const overlay = yamlToComposeDocument(`services:
  web:
    x-turbopanel:
      hosting:
        - hostname: app.example.com
        - hostname: docs.example.com
          pathPrefix: /docs
`)

  it('reads every entry a service declares, in document order', () => {
    expect(
      readComposeHostingEntries(overlay, 'web').map((e) => e.hostname),
    ).toEqual(['app.example.com', 'docs.example.com'])
    expect(readComposeHostingEntries(overlay, 'missing')).toEqual([])
  })

  it('locates an entry by its route rather than by position', () => {
    const entries = readComposeHostingEntries(overlay, 'web')
    expect(findComposeHostingEntryIndex(entries, 'docs.example.com /docs')).toBe(1)
    expect(findComposeHostingEntryIndex(entries, 'app.example.com /')).toBe(0)
    expect(findComposeHostingEntryIndex(entries, 'nope.example.com /')).toBe(-1)
  })

  it('replaces the whole list without touching other services', () => {
    const next = writeComposeHostingEntries(overlay, 'web', [
      { hostname: 'app.example.com', tls: { mode: 'internal' } },
    ])
    expect(readComposeHostingEntries(next, 'web')).toEqual([
      { hostname: 'app.example.com', tls: { mode: 'internal' } },
    ])
    // The source document is untouched — the caller saves the copy.
    expect(readComposeHostingEntries(overlay, 'web')).toHaveLength(2)
  })

  it('declares a route on a service the overlay did not mention', () => {
    const next = writeComposeHostingEntries(overlay, 'api', [
      { hostname: 'api.example.com' },
    ])
    expect(readComposeHostingEntries(next, 'api')).toEqual([
      { hostname: 'api.example.com' },
    ])
    expect(readComposeHostingEntries(next, 'web')).toHaveLength(2)
  })

  it('drops the hosting key when the last entry goes away', () => {
    const next = writeComposeHostingEntries(overlay, 'web', [])
    expect(readComposeHostingEntries(next, 'web')).toEqual([])
    expect(
      resolveHostingServiceContext(next, 'web').composeHostingEntries,
    ).toEqual([])
  })
})
