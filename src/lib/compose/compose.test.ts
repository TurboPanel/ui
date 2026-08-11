import { describe, expect, it } from 'vitest'
import {
  COMPOSE_TAG_KEY,
  composeDocumentToRuntimeYaml,
  composeDocumentToYaml,
  composeTagOf,
  emptyComposeDocument,
  hideComposeTurbopanelExtensions,
  isComposeTaggedValue,
  makeComposeTag,
  mergeComposeOverlay,
  normalizeCompose,
  readComposeEditorView,
  setComposeEditorView,
  stripComposeManagedExtension,
  stripComposePlacement,
  unwrapComposeTag,
  yamlToComposeDocument,
  type ComposeDocument,
} from './index'

describe('compose comment round-trip', () => {
  it('keeps nested map comments before a service key', () => {
    const source = `services:
  # comment
  nginx:
    image: nginx:alpine
`
    const roundTrip = composeDocumentToYaml(yamlToComposeDocument(source))
    expect(roundTrip).toContain('# comment')
    expect(roundTrip.indexOf('# comment')).toBeGreaterThan(roundTrip.indexOf('services:'))
    expect(roundTrip.indexOf('# comment')).toBeLessThan(roundTrip.indexOf('nginx:'))
    expect(roundTrip.trimStart().startsWith('services:')).toBe(true)
  })

  it('keeps leading document comments separated by a blank line', () => {
    const source = `# test

services:
  nginx:
    image: nginx # herpin and derpin 2
`
    const doc = yamlToComposeDocument(source)
    expect(doc.presentation.documentCommentBefore).toContain('test')
    expect(doc.presentation.comments.services?.keyBefore).toBeUndefined()

    const roundTrip = composeDocumentToYaml(doc)
    expect(roundTrip.startsWith('# test\n')).toBe(true)
    expect(roundTrip).toContain('# test\n\nservices:')
    expect(roundTrip).toContain('image: nginx # herpin and derpin 2')
  })

  it('setComposeEditorView keeps documentCommentBefore through save metadata', () => {
    const source = `# herpin and derpin

services:
  nginx:
    image: nginx:latest
`
    const parsed = yamlToComposeDocument(source)
    const saved = setComposeEditorView(parsed, 'editor')
    expect(saved.presentation.documentCommentBefore).toContain('herpin')
    expect(composeDocumentToYaml(saved)).toContain('# herpin and derpin\n\nservices:')
  })

  it('keeps leading comments glued to the first key when there is no blank line', () => {
    const source = `# test
services:
  nginx:
    image: nginx
`
    const doc = yamlToComposeDocument(source)
    expect(doc.presentation.documentCommentBefore).toBeUndefined()
    expect(doc.presentation.comments.services?.keyBefore).toContain('test')

    const roundTrip = composeDocumentToYaml(doc)
    expect(roundTrip).toContain('# test')
    expect(roundTrip.indexOf('# test')).toBeLessThan(roundTrip.indexOf('services:'))
  })

  it('keeps trailing document comments', () => {
    const source = `services:
  nginx:
    image: nginx
# trailing
`
    const doc = yamlToComposeDocument(source)
    expect(doc.presentation.documentComment).toContain('trailing')
    const roundTrip = composeDocumentToYaml(doc)
    expect(roundTrip).toContain('# trailing')
  })

  it('keeps trailing scalar comments', () => {
    const source = `services:
  nginx:
    image: nginx:alpine # line comment
`
    const roundTrip = composeDocumentToYaml(yamlToComposeDocument(source))
    expect(roundTrip).toContain('image: nginx:alpine # line comment')
  })

  it('keeps sequence-item trailing comments regardless of spacing before #', () => {
    const source = `services:
  uptime-kuma:
    image: louislam/uptime-kuma:2
    ports:
      - "3001:3001"  # This maps the container port
    volumes:
      - /path/to/data:/app/data  # Configuring persistent storage
    environment:
      - TZ=UTC  # Set the timezone
`
    const doc = yamlToComposeDocument(source)
    expect(doc.presentation.comments['services.uptime-kuma.ports[0]']?.inline)
      .toContain('This maps the container port')
    expect(doc.presentation.comments['services.uptime-kuma.volumes[0]']?.inline)
      .toContain('Configuring persistent storage')
    expect(doc.presentation.comments['services.uptime-kuma.environment[0]']?.inline)
      .toContain('Set the timezone')

    const roundTrip = composeDocumentToYaml(doc)
    expect(roundTrip).toContain('# This maps the container port')
    expect(roundTrip).toContain('# Configuring persistent storage')
    expect(roundTrip).toContain('# Set the timezone')
  })

  it('stripComposePlacement hides placement while preserving comments', () => {
    const source = yamlToComposeDocument(`services:
  # comment
  nginx:
    image: nginx:alpine # line comment
x-turbopanel:
  placement:
    server_id: 11111111-1111-4111-8111-111111111111
`)
    const user = stripComposePlacement(source)
    const userYaml = composeDocumentToYaml(user)
    expect(userYaml).not.toContain('x-turbopanel')
    expect(userYaml).toContain('# comment')
    expect(userYaml).toContain('# line comment')
  })

  it('stripComposePlacement removes stale project pins', () => {
    const projectPin = '11111111-1111-4111-8111-111111111111'
    const source = yamlToComposeDocument(`services:
  nginx:
    image: nginx:alpine
x-turbopanel:
  placement:
    server_id: ${projectPin}
`)
    const stripped = stripComposePlacement(source)
    expect(composeDocumentToYaml(stripped)).not.toContain('x-turbopanel')
    expect(composeDocumentToRuntimeYaml(stripped)).not.toContain(projectPin)
  })

  it('stripComposeManagedExtension hides all x-turbopanel from the YAML surface', () => {
    const source = yamlToComposeDocument(`services:
  site:
    x-turbopanel:
      serviceKind: traditional-web
      engine: nginx
  nginx:
    image: nginx:alpine
    x-turbopanel:
      serviceKind: container
      description: Edge proxy
x-turbopanel:
  placement:
    server_id: 11111111-1111-4111-8111-111111111111
`)
    const visible = stripComposeManagedExtension(source)
    const yaml = composeDocumentToYaml(visible)
    expect(yaml).not.toContain('x-turbopanel')
    expect(yaml).not.toContain('serviceKind')
    expect(yaml).not.toContain('description')
    expect(yaml).toContain('nginx:')
    expect(yaml).toContain('site:')
    // Full document still retained extensions before hide; managed strip is display-only.
    expect(
      (source.data.services as Record<string, unknown>).site,
    ).toMatchObject({
      'x-turbopanel': { serviceKind: 'traditional-web', engine: 'nginx' },
    })
  })

  it('stores editor view in presentation only, not x-turbopanel', () => {
    const source = yamlToComposeDocument(`services:
  nginx:
    image: nginx:alpine
`)
    const withView = setComposeEditorView(source, 'visual')
    expect(readComposeEditorView(withView)).toBe('visual')
    expect(withView.presentation.editorView).toBe('visual')
    expect(composeDocumentToYaml(withView)).not.toContain('x-turbopanel')

    const visible = stripComposeManagedExtension(withView)
    expect(composeDocumentToYaml(visible)).not.toContain('x-turbopanel')
    expect(readComposeEditorView(visible)).toBe('visual')

    const restored = setComposeEditorView(visible, 'editor')
    expect(readComposeEditorView(restored)).toBe('editor')
  })

  it('does not migrate legacy x-turbopanel.view into presentation', () => {
    const normalized = normalizeCompose({
      version: 1,
      data: {
        services: { nginx: { image: 'nginx:alpine' } },
        'x-turbopanel': { view: 'visual' },
      },
      presentation: { keyOrder: ['services', 'x-turbopanel'], comments: {} },
    })
    expect(normalized.presentation.editorView).toBeUndefined()
    expect(normalized.data['x-turbopanel']).toEqual({ view: 'visual' })
    expect(
      composeDocumentToYaml(hideComposeTurbopanelExtensions(normalized).document),
    ).not.toContain('x-turbopanel')
  })

})

describe('blank compose drafts', () => {
  it('treats services: {} as an empty draft', () => {
    const doc = yamlToComposeDocument('services: {}\n')
    expect(doc).toEqual(emptyComposeDocument())
    expect(composeDocumentToYaml(doc)).toBe('')
    expect(composeDocumentToRuntimeYaml(doc)).toBe('')
  })
})

describe('mergeComposeOverlay Compose Spec parity', () => {
  function docFrom(data: Record<string, unknown>): ComposeDocument {
    return {
      version: 1,
      data,
      presentation: { keyOrder: Object.keys(data), comments: {} },
    }
  }

  function servicesOf(merged: ComposeDocument): Record<string, Record<string, unknown>> {
    const services = merged.data.services
    if (typeof services !== 'object' || services === null || Array.isArray(services)) {
      throw new TypeError('expected services mapping')
    }
    return services as Record<string, Record<string, unknown>>
  }

  it('ports: append + unique-key replacement (short syntax)', () => {
    const base = docFrom({
      services: {
        web: {
          image: 'nginx',
          ports: ['8080:80', '127.0.0.1:9000:90'],
        },
      },
    })
    const overlay = docFrom({
      services: {
        web: {
          ports: ['8080:80', '3000:3000'],
        },
      },
    })
    const web = servicesOf(mergeComposeOverlay(base, overlay)).web
    expect(web.ports).toEqual(['8080:80', '127.0.0.1:9000:90', '3000:3000'])
  })

  it('volumes: dedup by container target', () => {
    const base = docFrom({
      services: {
        web: {
          volumes: ['data:/var/lib/data', './src:/app:ro'],
        },
      },
    })
    const overlay = docFrom({
      services: {
        web: {
          volumes: [
            'cache:/var/lib/data',
            { type: 'volume', source: 'logs', target: '/var/log' },
          ],
        },
      },
    })
    expect(servicesOf(mergeComposeOverlay(base, overlay)).web.volumes).toEqual([
      'cache:/var/lib/data',
      './src:/app:ro',
      { type: 'volume', source: 'logs', target: '/var/log' },
    ])
  })

  it('secrets and configs: unique key target ?? source', () => {
    const base = docFrom({
      services: {
        web: {
          secrets: ['db_password', { source: 'token', target: '/run/token' }],
          configs: ['app.conf'],
        },
      },
    })
    const overlay = docFrom({
      services: {
        web: {
          secrets: [
            { source: 'db_password' },
            { source: 'token', target: '/run/token' },
            'extra',
          ],
          configs: [{ source: 'app.conf', mode: 0o444 }],
        },
      },
    })
    const web = servicesOf(mergeComposeOverlay(base, overlay)).web
    expect(web.secrets).toEqual([
      { source: 'db_password' },
      { source: 'token', target: '/run/token' },
      'extra',
    ])
    expect(web.configs).toEqual([{ source: 'app.conf', mode: 0o444 }])
  })

  it('expose / extra_hosts scalar-dedup; dns / tmpfs / env_file plain-append preserves duplicates', () => {
    const base = docFrom({
      services: {
        web: {
          expose: ['80', '443'],
          dns: ['1.1.1.1'],
          dns_search: ['example.com'],
          tmpfs: ['/tmp'],
          env_file: ['.env'],
          extra_hosts: ['db:host-gateway'],
        },
      },
    })
    const overlay = docFrom({
      services: {
        web: {
          expose: ['443', '8080'],
          dns: ['1.1.1.1', '8.8.8.8'],
          dns_search: ['example.com', 'internal'],
          tmpfs: ['/tmp', '/run'],
          env_file: ['.env', '.env.local'],
          extra_hosts: ['db:host-gateway', 'cache:host-gateway'],
        },
      },
    })
    const web = servicesOf(mergeComposeOverlay(base, overlay)).web
    // Unique expose / extra_hosts entries are de-duplicated (first position kept).
    expect(web.expose).toEqual(['80', '443', '8080'])
    expect(web.extra_hosts).toEqual(['db:host-gateway', 'cache:host-gateway'])
    // Docker Compose preserves duplicate entries on these attributes.
    expect(web.dns).toEqual(['1.1.1.1', '1.1.1.1', '8.8.8.8'])
    expect(web.dns_search).toEqual(['example.com', 'example.com', 'internal'])
    expect(web.tmpfs).toEqual(['/tmp', '/tmp', '/run'])
    expect(web.env_file).toEqual(['.env', '.env', '.env.local'])
  })

  it('labels list form: keyed dedup (overlay wins value)', () => {
    const base = docFrom({
      services: {
        web: {
          labels: ['com.example.foo=a', 'com.example.bar=b'],
          environment: ['FOO=1', 'BAR'],
        },
      },
    })
    const overlay = docFrom({
      services: {
        web: {
          labels: ['com.example.foo=z', 'com.example.baz=c'],
          environment: ['FOO=2', 'BAZ=3'],
        },
      },
    })
    const web = servicesOf(mergeComposeOverlay(base, overlay)).web
    expect(web.labels).toEqual([
      'com.example.foo=z',
      'com.example.bar=b',
      'com.example.baz=c',
    ])
    expect(web.environment).toEqual(['FOO=2', 'BAR', 'BAZ=3'])
  })

  it('labels / environment: list-base + map-overlay merge via duality', () => {
    const base = docFrom({
      services: {
        web: {
          labels: ['com.example.foo=a'],
          environment: ['FOO=1'],
        },
      },
    })
    const overlay = docFrom({
      services: {
        web: {
          labels: { 'com.example.foo': 'z', 'com.example.bar': 'b' },
          environment: { FOO: '2', BAR: '3' },
        },
      },
    })
    const web = servicesOf(mergeComposeOverlay(base, overlay)).web
    expect(web.labels).toEqual({
      'com.example.foo': 'z',
      'com.example.bar': 'b',
    })
    expect(web.environment).toEqual({ FOO: '2', BAR: '3' })
  })

  it('command / entrypoint / healthcheck.test fully replace', () => {
    const base = docFrom({
      services: {
        web: {
          command: ['nginx', '-g', 'daemon off;'],
          entrypoint: ['/entry.sh'],
          healthcheck: { test: ['CMD', 'curl', '-f', 'http://localhost'] },
        },
      },
    })
    const overlay = docFrom({
      services: {
        web: {
          command: ['sleep', 'infinity'],
          entrypoint: ['/bin/sh'],
          healthcheck: { test: ['CMD-SHELL', 'exit 0'] },
        },
      },
    })
    const web = servicesOf(mergeComposeOverlay(base, overlay)).web
    expect(web.command).toEqual(['sleep', 'infinity'])
    expect(web.entrypoint).toEqual(['/bin/sh'])
    expect(web.healthcheck).toEqual({ test: ['CMD-SHELL', 'exit 0'] })
  })

  it('!reset deletes key; !override replaces without append (sentinel shape)', () => {
    const base = docFrom({
      services: {
        web: {
          image: 'nginx',
          ports: ['80:80'],
          environment: { FOO: '1' },
        },
      },
    })
    const overlay = docFrom({
      services: {
        web: {
          ports: makeComposeTag('override', ['443:443']),
          environment: makeComposeTag('reset', null),
        },
      },
    })
    const web = servicesOf(mergeComposeOverlay(base, overlay)).web
    expect(web.ports).toEqual(['443:443'])
    expect('environment' in web).toBe(false)
    expect(web.image).toBe('nginx')
    expect(isComposeTaggedValue(web.ports)).toBe(false)
  })

  it('base-layer tags are unwrapped (no leak into effective document)', () => {
    const base = docFrom({
      services: {
        web: {
          image: 'nginx',
          ports: makeComposeTag('override', ['80:80']),
        },
      },
    })
    const overlay = docFrom({
      services: {
        db: { image: 'postgres' },
      },
    })
    const merged = mergeComposeOverlay(base, overlay)
    const services = servicesOf(merged)
    expect(services.web.ports).toEqual(['80:80'])
    expect(isComposeTaggedValue(services.web.ports)).toBe(false)
    expect(services.db.image).toBe('postgres')
  })

  it('shifts presentation ports[i] comment paths after append', () => {
    const base: ComposeDocument = {
      version: 1,
      data: {
        services: {
          web: { image: 'nginx', ports: ['80:80'] },
        },
      },
      presentation: {
        keyOrder: ['services'],
        comments: {
          'services.web.ports[0]': { inline: 'base-port' },
        },
      },
    }
    const overlay: ComposeDocument = {
      version: 1,
      data: {
        services: {
          web: { ports: ['443:443'] },
        },
      },
      presentation: {
        keyOrder: ['services'],
        comments: {
          'services.web.ports[0]': { inline: 'overlay-port' },
        },
      },
    }
    const merged = mergeComposeOverlay(base, overlay)
    expect(servicesOf(merged).web.ports).toEqual(['80:80', '443:443'])
    expect(merged.presentation.comments['services.web.ports[0]']?.inline).toBe('base-port')
    expect(merged.presentation.comments['services.web.ports[1]']?.inline).toBe('overlay-port')
  })

  it('COMPOSE_TAG_KEY sentinel shape is stable', () => {
    expect(COMPOSE_TAG_KEY).toBe('__turbopanelComposeTag')
    const tag = makeComposeTag('reset', null)
    expect(tag[COMPOSE_TAG_KEY]).toBe('reset')
    expect(isComposeTaggedValue(tag)).toBe(true)
  })
})

describe('compose !reset / !override tag round-trip', () => {
  it('parses tags into sentinels and re-emits original tag syntax', () => {
    const source = `services:
  web:
    image: nginx
    environment: !reset null
    labels: !reset []
    ports: !override
      - "9000:80"
    volumes: !override
      data: /data
    command: !override hello
`
    const doc = yamlToComposeDocument(source)
    const web = (doc.data.services as Record<string, Record<string, unknown>>).web

    expect(isComposeTaggedValue(web.environment)).toBe(true)
    expect(composeTagOf(web.environment)).toBe('reset')
    expect(unwrapComposeTag(web.environment)).toBeNull()

    expect(isComposeTaggedValue(web.labels)).toBe(true)
    expect(unwrapComposeTag(web.labels)).toEqual([])

    expect(composeTagOf(web.ports)).toBe('override')
    expect(unwrapComposeTag(web.ports)).toEqual(['9000:80'])

    expect(composeTagOf(web.volumes)).toBe('override')
    expect(unwrapComposeTag(web.volumes)).toEqual({ data: '/data' })

    expect(composeTagOf(web.command)).toBe('override')
    expect(unwrapComposeTag(web.command)).toBe('hello')

    const out = composeDocumentToYaml(doc)
    expect(out).toContain('environment: !reset null')
    expect(out).toContain('labels: !reset []')
    expect(out).toContain('ports: !override')
    expect(out).toContain('volumes: !override')
    expect(out).toContain('command: !override hello')

    // Runtime YAML also re-tags sentinels (deploy-facing stringifier).
    const runtime = composeDocumentToRuntimeYaml(doc)
    expect(runtime).toContain('environment: !reset null')
    expect(runtime).toContain('ports: !override')

    // Second hop keeps sentinels.
    const again = yamlToComposeDocument(out)
    const web2 = (again.data.services as Record<string, Record<string, unknown>>).web
    expect(composeTagOf(web2.environment)).toBe('reset')
    expect(composeTagOf(web2.ports)).toBe('override')
  })
})
