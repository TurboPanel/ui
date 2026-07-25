import { describe, expect, it } from 'vitest'
import { yamlToComposeDocument } from './convert'
import {
  hostingDockerBridgeHint,
  hostingPhpSectionCopy,
  hostingServiceKindLabel,
  hostingWebEnvSectionCopy,
  resolveHostingServiceContext,
  shouldRevealOptionalHostingFields,
  traditionalWebEnvKeyForService,
} from './hosting-service-context'

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
