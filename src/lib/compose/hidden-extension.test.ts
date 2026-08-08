import { describe, expect, it } from 'vitest'
import {
  composeDocumentToYaml,
  hideComposeTurbopanelExtensions,
  hiddenTraditionalWebServiceNames,
  restoreComposeTurbopanelExtensions,
  yamlToComposeDocument,
} from './index'

describe('hideComposeTurbopanelExtensions', () => {
  it('removes top-level and per-service x-turbopanel from YAML output', () => {
    const full = yamlToComposeDocument(`services:
  site:
    x-turbopanel:
      serviceKind: traditional-web
      engine: nginx
      root: public
      description: Landing
  nginx:
    image: nginx:alpine
    x-turbopanel:
      serviceKind: container
x-turbopanel:
  placement:
    server_id: 11111111-1111-4111-8111-111111111111
`)
    const { document: visible, hidden } = hideComposeTurbopanelExtensions(full)
    const yaml = composeDocumentToYaml(visible)
    expect(yaml).not.toContain('x-turbopanel')
    expect(yaml).not.toContain('serviceKind')
    expect(yaml).not.toContain('description')
    expect(yaml).toContain('site:')
    expect(yaml).toContain('nginx:')
    expect(hidden.root).toEqual({
      placement: { server_id: '11111111-1111-4111-8111-111111111111' },
    })
    expect(hidden.services.site).toMatchObject({
      serviceKind: 'traditional-web',
      engine: 'nginx',
      root: 'public',
      description: 'Landing',
    })
  })

  it('round-trips description / serviceKind / engine / root and unknown fields', () => {
    const full = yamlToComposeDocument(`services:
  # keep me
  site:
    image: ignored:for-tw
    x-turbopanel:
      serviceKind: traditional-web
      engine: apache
      root: www
      description: Docs
      futureField: keep-this
`)
    const { document: visible, hidden } = hideComposeTurbopanelExtensions(full)
    const authorYaml = composeDocumentToYaml(visible)
    expect(authorYaml).toContain('# keep me')
    expect(authorYaml).not.toContain('x-turbopanel')

    const restored = restoreComposeTurbopanelExtensions(
      yamlToComposeDocument(authorYaml),
      hidden,
    )
    const site = (restored.data.services as Record<string, Record<string, unknown>>)
      .site
    expect(site['x-turbopanel']).toEqual({
      serviceKind: 'traditional-web',
      engine: 'apache',
      root: 'www',
      description: 'Docs',
      futureField: 'keep-this',
    })
    expect(composeDocumentToYaml(restored)).toContain('# keep me')
  })

  it('drops metadata for services removed in YAML', () => {
    const full = yamlToComposeDocument(`services:
  gone:
    x-turbopanel:
      serviceKind: traditional-web
      engine: nginx
  stay:
    image: nginx:alpine
    x-turbopanel:
      description: kept
`)
    const { document: visible, hidden } = hideComposeTurbopanelExtensions(full)
    const edited = yamlToComposeDocument(`services:
  stay:
    image: nginx:alpine
`)
    const restored = restoreComposeTurbopanelExtensions(edited, hidden)
    const services = restored.data.services as Record<string, Record<string, unknown>>
    expect(services.gone).toBeUndefined()
    expect(services.stay['x-turbopanel']).toEqual({ description: 'kept' })
    expect(composeDocumentToYaml(visible)).toContain('gone:')
  })

  it('keeps a traditional-web service key with no other compose fields', () => {
    const full = yamlToComposeDocument(`services:
  site:
    x-turbopanel:
      serviceKind: traditional-web
      engine: nginx
`)
    const { document: visible, hidden } = hideComposeTurbopanelExtensions(full)
    const yaml = composeDocumentToYaml(visible)
    expect(yaml).toContain('site:')
    expect(yaml).not.toContain('x-turbopanel')
    expect(hiddenTraditionalWebServiceNames(hidden)).toEqual(['site'])
  })

  it('platform shadow wins over author-typed x-turbopanel', () => {
    const full = yamlToComposeDocument(`services:
  app:
    image: app:1
    x-turbopanel:
      serviceKind: container
      description: Original
`)
    const { hidden } = hideComposeTurbopanelExtensions(full)
    const author = yamlToComposeDocument(`services:
  app:
    image: app:2
    x-turbopanel:
      description: Author typed this
`)
    const restored = restoreComposeTurbopanelExtensions(author, hidden)
    const app = (restored.data.services as Record<string, Record<string, unknown>>)
      .app
    expect(app.image).toBe('app:2')
    expect(app['x-turbopanel']).toEqual({
      serviceKind: 'container',
      description: 'Original',
    })
  })
})
