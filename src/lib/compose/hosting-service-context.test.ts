import { describe, expect, it } from 'vitest'
import { yamlToComposeDocument } from './convert'
import {
  hostingDockerBridgeHint,
  hostingPathPrefixHint,
  hostingPhpSectionCopy,
  hostingServiceKindLabel,
  hostingWebEnvSectionCopy,
  readComposeServiceMap,
  resolveHostingServiceContext,
  shouldRevealOptionalHostingFields,
  traditionalWebEnvKeyForService,
} from './hosting-service-context'
import type { ComposeDocument } from './types'

describe('traditionalWebEnvKeyForService', () => {
  it('sanitizes compose service names like the daemon', () => {
    expect(traditionalWebEnvKeyForService('my-app')).toBe(
      'TURBOPANEL_TRADITIONAL_WEB_MY_APP_URL',
    )
    expect(traditionalWebEnvKeyForService('2web')).toBe(
      'TURBOPANEL_TRADITIONAL_WEB__2WEB_URL',
    )
  })
})

describe('resolveHostingServiceContext', () => {
  it('detects Apache traditional-web and PHP applicability', () => {
    const document = yamlToComposeDocument(`services:
  api:
    x-turbopanel:
      serviceKind: traditional-web
      engine: apache
      root: public
  static:
    x-turbopanel:
      serviceKind: traditional-web
      engine: nginx
      root: public
`)

    const apache = resolveHostingServiceContext(document, 'api')
    expect(apache.kind).toBe('traditional-web')
    expect(apache.engine).toBe('apache')
    expect(apache.phpApplicability).toBe('applicable')
    expect(apache.webEnvMode).toBe('apache_setenv')
    expect(apache.traditionalSiblingNames).toEqual(['static'])
    expect(hostingServiceKindLabel(apache)).toBe('Traditional web · Apache')
    expect(hostingPhpSectionCopy(apache).showFields).toBe(true)
    expect(hostingWebEnvSectionCopy(apache).showFields).toBe(true)
  })

  it('marks OpenLiteSpeed PHP and web env as ignored', () => {
    const document = yamlToComposeDocument(`services:
  site:
    x-turbopanel:
      serviceKind: traditional-web
      engine: openlitespeed
`)

    const ols = resolveHostingServiceContext(document, 'site')
    expect(ols.phpApplicability).toBe('ignored')
    expect(ols.webEnvMode).toBe('ignored')
    expect(hostingPhpSectionCopy(ols).showFields).toBe(false)
    expect(hostingWebEnvSectionCopy(ols).showFields).toBe(false)
  })

  it('surfaces docker bridge env hint for containers next to traditional-web', () => {
    const document = yamlToComposeDocument(`services:
  app:
    image: node:22
  php:
    x-turbopanel:
      serviceKind: traditional-web
      engine: apache
`)

    const container = resolveHostingServiceContext(document, 'app')
    expect(container.kind).toBe('container')
    expect(container.phpApplicability).toBe('not_applicable')
    expect(container.webEnvMode).toBe('container_variables')
    const hint = hostingDockerBridgeHint(container)
    expect(hint).toContain('TURBOPANEL_TRADITIONAL_WEB_PHP_URL')
    expect(hint).toContain('TURBOPANEL_TRADITIONAL_WEB_ENDPOINTS')
    expect(hostingDockerBridgeHint(resolveHostingServiceContext(document, 'php'))).toBeNull()
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
    expect(missing.traditionalSiblingNames).toEqual([])
    expect(hostingServiceKindLabel(missing)).toBe('Container')
    expect(hostingPhpSectionCopy(missing).showFields).toBe(false)
    expect(hostingWebEnvSectionCopy(missing).showFields).toBe(false)
    expect(hostingDockerBridgeHint(missing)).toBeNull()
  })

  it('uses nginx defaults for traditional-web without an explicit engine', () => {
    const document = yamlToComposeDocument(`services:
  site:
    x-turbopanel:
      serviceKind: traditional-web
      root: public
`)
    const nginx = resolveHostingServiceContext(document, 'site')
    expect(nginx.engine).toBe('nginx')
    expect(nginx.webEnvMode).toBe('file_only')
    expect(hostingServiceKindLabel(nginx)).toBe('Traditional web · nginx')
    expect(hostingPhpSectionCopy(nginx).showFields).toBe(false)
    expect(hostingWebEnvSectionCopy(nginx).showFields).toBe(true)
  })
})

describe('hosting copy helpers', () => {
  it('lists siblings in the path-prefix hint when present', () => {
    const withSiblings = resolveHostingServiceContext(
      yamlToComposeDocument(`services:
  api:
    x-turbopanel:
      serviceKind: traditional-web
      engine: apache
  static:
    x-turbopanel:
      serviceKind: traditional-web
      engine: nginx
`),
      'api',
    )
    expect(hostingPathPrefixHint(withSiblings)).toContain('static')

    const alone = resolveHostingServiceContext(
      yamlToComposeDocument(`services:
  api:
    x-turbopanel:
      serviceKind: traditional-web
      engine: apache
`),
      'api',
    )
    expect(hostingPathPrefixHint(alone)).not.toContain('Other traditional-web')
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
})
