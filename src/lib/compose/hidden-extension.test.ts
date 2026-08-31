import { describe, expect, it } from 'vitest'
import {
  composeDocumentToYaml,
  hideComposeTurbopanelExtensions,
  hiddenSiteServiceNames,
  restoreComposeTurbopanelExtensions,
  yamlToComposeDocument,
} from './index'

describe('hideComposeTurbopanelExtensions', () => {
  it('removes top-level and per-service x-turbopanel from YAML output', () => {
    const full = yamlToComposeDocument(`services:
  site:
    x-turbopanel:
      serviceKind: site
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
      serviceKind: 'site',
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
      serviceKind: site
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
      serviceKind: 'site',
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
      serviceKind: site
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

  it('keeps a site service key with no other compose fields', () => {
    const full = yamlToComposeDocument(`services:
  site:
    x-turbopanel:
      serviceKind: site
      engine: nginx
`)
    const { document: visible, hidden } = hideComposeTurbopanelExtensions(full)
    const yaml = composeDocumentToYaml(visible)
    expect(yaml).toContain('site:')
    expect(yaml).not.toContain('x-turbopanel')
    expect(hiddenSiteServiceNames(hidden)).toEqual(['site'])
  })

  it('stashes presentation comments and blank lines on extension paths', () => {
    const full = yamlToComposeDocument(`services:
  site:
    x-turbopanel:
      serviceKind: site
      engine: nginx
  web:
    image: nginx
`)
    full.presentation.comments = {
      ...full.presentation.comments,
      'x-turbopanel': { before: 'root ext' },
      'services.site.x-turbopanel': { keyBefore: 'service ext' },
      'services.web.image': { inline: 'keep' },
    }
    full.presentation.blankLines = {
      'x-turbopanel#key': 1,
      'services.site.x-turbopanel#key': 1,
      'services.web.image#key': 1,
    }

    const { document: visible, hidden } = hideComposeTurbopanelExtensions(full)
    expect(hidden.comments['x-turbopanel']).toEqual({ before: 'root ext' })
    expect(hidden.comments['services.site.x-turbopanel']).toEqual({
      keyBefore: 'service ext',
    })
    expect(hidden.blankLines['x-turbopanel#key']).toBe(1)
    expect(visible.presentation.comments['x-turbopanel']).toBeUndefined()
    expect(visible.presentation.comments['services.web.image']?.inline).toBe('keep')
    expect(visible.presentation.blankLines?.['services.web.image#key']).toBe(1)

    const restored = restoreComposeTurbopanelExtensions(visible, hidden)
    expect(restored.presentation.comments['x-turbopanel']).toEqual(
      hidden.comments['x-turbopanel'],
    )
    expect(restored.presentation.comments['services.site.x-turbopanel']).toEqual(
      hidden.comments['services.site.x-turbopanel'],
    )
    expect(restored.presentation.blankLines?.['x-turbopanel#key']).toBe(1)
  })

  it('skips non-record service values and clears root when hidden has none', () => {
    const full = yamlToComposeDocument(`services:
  broken: not-a-map
  web:
    image: nginx
`)
    const { document: visible, hidden } = hideComposeTurbopanelExtensions(full)
    expect(composeDocumentToYaml(visible)).toContain('broken: not-a-map')

    const restored = restoreComposeTurbopanelExtensions(visible, hidden)
    expect(restored.data['x-turbopanel']).toBeUndefined()
    expect(restored.presentation.keyOrder).not.toContain('x-turbopanel')
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

  it('filters non-site services from hiddenSiteServiceNames', () => {
    const hidden = {
      services: {
        site: { serviceKind: 'site', engine: 'nginx' },
        api: { serviceKind: 'container' },
        broken: 'not-an-object',
      },
      comments: {},
      blankLines: {},
    }
    expect(hiddenSiteServiceNames(hidden)).toEqual(['site'])
  })

  it('round-trips a root principals block byte for byte', () => {
    // `hidden.root` is opaque on purpose: the YAML surface stashes whatever the
    // root extension holds and puts it back untouched. This locks that in for
    // `principals` explicitly — key order, comments, and blank lines included —
    // so a later phase's authoring UI cannot quietly lose an alias.
    const source = `# header

services:
  web:
    image: nginx

x-turbopanel:
  # who this project runs as
  principals:
    web:
      description: serves the site
      access: sftp

    worker:
      access: none
`
    const full = yamlToComposeDocument(source)
    const { document: visible, hidden } = hideComposeTurbopanelExtensions(full)

    expect(composeDocumentToYaml(visible)).not.toContain('x-turbopanel')
    expect(composeDocumentToYaml(visible)).not.toContain('principals')
    expect(hidden.root).toEqual({
      principals: {
        web: { description: 'serves the site', access: 'sftp' },
        worker: { access: 'none' },
      },
    })

    const restored = restoreComposeTurbopanelExtensions(visible, hidden)
    expect(composeDocumentToYaml(restored)).toBe(source)
    expect(restored.presentation.keyOrder).toEqual(full.presentation.keyOrder)
    expect(restored.presentation.comments).toEqual(full.presentation.comments)
    expect(restored.presentation.blankLines).toEqual(
      full.presentation.blankLines,
    )
    // Per-service extensions are what `hiddenSiteServiceNames` inspects; a root
    // principals block is none of its business and must not appear.
    expect(hiddenSiteServiceNames(hidden)).toEqual([])
  })

  it('round-trips a root block authored before services', () => {
    // The root extension is not required to be the last top-level key. Hiding
    // it and putting it back must not reorder a document the author never
    // touched, so the stash records where it sat.
    const source = `x-turbopanel:
  principals:
    web:
      description: serves the site
      access: sftp

services:
  web:
    image: nginx
`
    const full = yamlToComposeDocument(source)
    expect(full.presentation.keyOrder).toEqual(['x-turbopanel', 'services'])

    const { document: visible, hidden } = hideComposeTurbopanelExtensions(full)
    expect(composeDocumentToYaml(visible)).not.toContain('x-turbopanel')
    expect(hidden.rootKeyIndex).toBe(0)
    expect(hidden.rootAfterKey).toBeUndefined()

    const restored = restoreComposeTurbopanelExtensions(visible, hidden)
    expect(composeDocumentToYaml(restored)).toBe(source)
    expect(restored.presentation.keyOrder).toEqual(full.presentation.keyOrder)
  })

  it('restores a root block after the sibling it followed', () => {
    const source = `name: demo
x-turbopanel:
  principals:
    web: {}
services:
  web:
    image: nginx
networks:
  edge: {}
`
    const full = yamlToComposeDocument(source)
    const { document: visible, hidden } = hideComposeTurbopanelExtensions(full)
    expect(hidden.rootAfterKey).toBe('name')
    expect(hidden.rootKeyIndex).toBe(1)

    const restored = restoreComposeTurbopanelExtensions(visible, hidden)
    expect(composeDocumentToYaml(restored)).toBe(source)
  })

  it('falls back to the recorded index when the anchor key is gone', () => {
    const full = yamlToComposeDocument(`name: demo
x-turbopanel:
  principals:
    web: {}
services:
  web:
    image: nginx
`)
    const { hidden } = hideComposeTurbopanelExtensions(full)
    // The author deleted `name` while the block was hidden; index 1 is still
    // the nearest honest answer, and appending would be a bigger lie.
    const edited = yamlToComposeDocument(`services:
  web:
    image: nginx
networks:
  edge: {}
`)
    const restored = restoreComposeTurbopanelExtensions(edited, hidden)
    expect(restored.presentation.keyOrder).toEqual([
      'services',
      'x-turbopanel',
      'networks',
    ])
  })

  it('preserves document comments when hiding and restoring', () => {
    const full = yamlToComposeDocument(`# header

services:
  web:
    image: nginx
# footer
`)
    full.presentation.documentCommentBefore = 'header'
    full.presentation.documentComment = 'footer'
    const { document: visible, hidden } = hideComposeTurbopanelExtensions(full)
    expect(visible.presentation.documentCommentBefore).toBe('header')
    expect(visible.presentation.documentComment).toBe('footer')

    hidden.root = { placement: { server_id: '11111111-1111-4111-8111-111111111111' } }
    const restored = restoreComposeTurbopanelExtensions(visible, hidden)
    expect(restored.data['x-turbopanel']).toEqual({
      placement: { server_id: '11111111-1111-4111-8111-111111111111' },
    })
    expect(restored.presentation.keyOrder).toContain('x-turbopanel')
    expect(restored.presentation.documentCommentBefore).toBe('header')
  })

  it('removes a restored root extension when the shadow has none', () => {
    const visible = yamlToComposeDocument(`services:
  web:
    image: nginx
x-turbopanel:
  leftover: true
`)
    const restored = restoreComposeTurbopanelExtensions(visible, {
      services: {},
      comments: {},
      blankLines: {},
    })
    expect(restored.data['x-turbopanel']).toBeUndefined()
    expect(restored.presentation.keyOrder).not.toContain('x-turbopanel')
  })

  it('stashes nested extension presentation paths and preserves editorView', () => {
    const full = yamlToComposeDocument(`services:
  site:
    x-turbopanel:
      serviceKind: site
      engine: nginx
`)
    full.presentation.editorView = 'visual'
    full.presentation.comments = {
      ...full.presentation.comments,
      'services.site.x-turbopanel.engine': { inline: 'engine' },
      'services.site.image': { inline: 'keep' },
    }
    const { document: visible, hidden } = hideComposeTurbopanelExtensions(full)
    expect(visible.presentation.editorView).toBe('visual')
    expect(hidden.comments['services.site.x-turbopanel.engine']).toEqual({
      inline: 'engine',
    })
    expect(visible.presentation.comments['services.site.image']?.inline).toBe(
      'keep',
    )

    const restored = restoreComposeTurbopanelExtensions(visible, hidden)
    expect(restored.presentation.editorView).toBe('visual')
    expect(restored.presentation.comments['services.site.x-turbopanel.engine']).toEqual(
      { inline: 'engine' },
    )
  })

  it('includes node services in hiddenSiteServiceNames', () => {
    const hidden = {
      services: {
        api: { serviceKind: 'node', framework: 'auto' },
        web: { serviceKind: 'container' },
      },
      comments: {},
      blankLines: {},
    }
    expect(hiddenSiteServiceNames(hidden)).toEqual(['api'])
  })

  it('leaves a non-map services value untouched on restore', () => {
    const visible = yamlToComposeDocument(`services: not-a-map
`)
    const restored = restoreComposeTurbopanelExtensions(visible, {
      services: { web: { serviceKind: 'container' } },
      comments: {},
      blankLines: {},
    })
    expect(restored.data.services).toBe('not-a-map')
  })
})
