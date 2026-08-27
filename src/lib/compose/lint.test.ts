import { parseDocument } from 'yaml'
import { describe, expect, it } from 'vitest'
import {
  blockingComposeLintIssues,
  isComposeServicePropertyKey,
  isComposeTopLevelKey,
  lintComposeYaml,
} from './lint'

describe('lintComposeYaml', () => {
  it('returns no issues for empty input', () => {
    expect(lintComposeYaml('')).toEqual([])
    expect(lintComposeYaml('   \n')).toEqual([])
  })

  it('accepts a valid service', () => {
    const source = `services:
  nginx:
    image: nginx:alpine
    ports:
      - "8080:80"
`
    expect(lintComposeYaml(source)).toEqual([])
  })

  it('flags a misspelled service key with a suggestion and line number', () => {
    const source = `services:
  # ok
  nginx:
    # ido what to do here
    imaage: nginx # shit i dunno lol
`
    const issues = lintComposeYaml(source)
    const unknown = issues.find((issue) => issue.path === 'services.nginx.imaage')
    expect(unknown).toBeDefined()
    expect(unknown?.level).toBe('warning')
    expect(unknown?.message).toContain('did you mean "image"')
    expect(unknown?.line).toBe(5)
  })

  it('errors when a service has neither image nor build', () => {
    const source = `services:
  nginx:
    imaage: nginx
`
    const issues = lintComposeYaml(source)
    const missing = issues.find(
      (issue) => issue.level === 'error' && issue.path === 'services.nginx',
    )
    expect(missing).toBeDefined()
    expect(missing?.message).toContain('image')
    expect(missing?.message).toContain('build')
  })

  it('allows site services without image or build', () => {
    const source = `services:
  site:
    x-turbopanel:
      serviceKind: site
      engine: nginx
`
    expect(lintComposeYaml(source)).toEqual([])
  })

  it('orders issues by line number', () => {
    const source = `services:
  # ok
  nginx:
    # comment
    imaage: nginx
`
    const issues = lintComposeYaml(source)
    expect(issues.map((issue) => issue.line)).toEqual([3, 5])
    expect(issues[0]?.level).toBe('error')
    expect(issues[0]?.message).toContain('image')
    expect(issues[1]?.level).toBe('warning')
    expect(issues[1]?.message).toContain('imaage')
  })

  it('blockingComposeLintIssues allows empty-draft warnings only', () => {
    expect(blockingComposeLintIssues(lintComposeYaml('networks:\n  default: {}\n'))).toEqual([])
    expect(blockingComposeLintIssues(lintComposeYaml('services: {}\n'))).toEqual([])
    expect(
      blockingComposeLintIssues(lintComposeYaml(`services:
  nginx:
    imaage: nginx
`)).length,
    ).toBeGreaterThan(0)
  })

  it('accepts a build-only service', () => {
    const source = `services:
  app:
    build: .
`
    expect(lintComposeYaml(source)).toEqual([])
  })

  it('treats empty-string image as missing', () => {
    const source = `services:
  app:
    image: ""
`
    const issues = lintComposeYaml(source)
    const missing = issues.find(
      (issue) => issue.level === 'error' && issue.path === 'services.app',
    )
    expect(missing).toBeDefined()
    expect(missing?.message).toContain('image')
    expect(missing?.message).toContain('build')
  })

  it('allows build-only when image is an empty string', () => {
    const source = `services:
  app:
    image: ""
    build:
      context: .
      dockerfile_inline: |
        FROM alpine
`
    expect(lintComposeYaml(source)).toEqual([])
  })

  it('flags an unknown top-level key', () => {
    const source = `servces:
  nginx:
    image: nginx
`
    const issues = lintComposeYaml(source)
    const unknown = issues.find((issue) => issue.path === 'servces')
    expect(unknown?.level).toBe('warning')
    expect(unknown?.message).toContain('did you mean "services"')
  })

  it('allows site services without image or build when listed via options', () => {
    const source = `services:
  site: {}
`
    expect(
      lintComposeYaml(source, { siteServices: ['site'] }),
    ).toEqual([])
  })

  it('still errors for missing image when siteServices omits the service', () => {
    const source = `services:
  site: {}
`
    const issues = lintComposeYaml(source, {
      siteServices: ['other'],
    })
    expect(
      issues.some(
        (issue) =>
          issue.level === 'error' && issue.path === 'services.site',
      ),
    ).toBe(true)
  })

  it('warns when x-turbopanel is typed and managedExtensionHidden is set', () => {
    const source = `services:
  nginx:
    image: nginx:alpine
    x-turbopanel:
      serviceKind: container
x-turbopanel:
  placement:
    server_id: abc
`
    const issues = lintComposeYaml(source, { managedExtensionHidden: true })
    const serviceExt = issues.find(
      (issue) => issue.path === 'services.nginx.x-turbopanel',
    )
    const rootExt = issues.find((issue) => issue.path === 'x-turbopanel')
    expect(serviceExt?.level).toBe('warning')
    expect(serviceExt?.message).toContain('managed by TurboPanel')
    expect(serviceExt?.line).toBe(4)
    expect(rootExt?.level).toBe('warning')
    expect(rootExt?.line).toBe(6)
  })

  it('still errors for missing image when author types site under managedExtensionHidden', () => {
    const source = `services:
  site:
    x-turbopanel:
      serviceKind: site
      engine: nginx
`
    const issues = lintComposeYaml(source, { managedExtensionHidden: true })
    const managedWarning = issues.find(
      (issue) => issue.path === 'services.site.x-turbopanel',
    )
    const missing = issues.find(
      (issue) => issue.level === 'error' && issue.path === 'services.site',
    )
    expect(managedWarning?.level).toBe('warning')
    expect(managedWarning?.message).toContain('managed by TurboPanel')
    expect(missing).toBeDefined()
    expect(missing?.message).toContain('image')
    expect(missing?.message).toContain('build')
  })

  it('allows x- extension keys', () => {
    const source = `x-turbopanel:
  placement:
    server_id: abc
services:
  nginx:
    image: nginx
`
    expect(lintComposeYaml(source)).toEqual([])
  })

  it('reports invalid YAML as an error with a line', () => {
    const source = `services:
  nginx:
  image: nginx
    ports: bad
`
    const issues = lintComposeYaml(source)
    expect(issues.some((issue) => issue.level === 'error')).toBe(true)
  })

  it('errors when services is not a mapping', () => {
    const source = `services: nginx
`
    const issues = lintComposeYaml(source)
    expect(issues.some((issue) => issue.path === 'services' && issue.level === 'error')).toBe(true)
  })

  it('errors when the document root is not a mapping', () => {
    const issues = lintComposeYaml('- not-a-map\n')
    expect(issues).toEqual([
      expect.objectContaining({
        level: 'error',
        path: '$',
        message: 'Compose file root must be a mapping',
      }),
    ])
  })

  it('warns when there are no services', () => {
    const source = `networks:
  default: {}
`
    const issues = lintComposeYaml(source)
    expect(issues.some((issue) => issue.message.includes('no "services"'))).toBe(true)
  })

  it('tolerates !override sequence tags without unresolved-tag errors', () => {
    const source = `services:
  nginx:
    image: nginx:alpine
    ports: !override
      - "443:443"
`
    const issues = lintComposeYaml(source)
    expect(issues.filter((issue) => issue.level === 'error')).toEqual([])
    expect(
      issues.some((issue) => issue.message.toLowerCase().includes('unresolved')),
    ).toBe(false)
  })

  it('tolerates !reset scalar tags without unresolved-tag errors', () => {
    const source = `services:
  nginx:
    image: nginx:alpine
    environment: !reset null
`
    const issues = lintComposeYaml(source)
    expect(issues.filter((issue) => issue.level === 'error')).toEqual([])
    expect(
      issues.some((issue) => /tag|unresolved/i.test(issue.message)),
    ).toBe(false)
  })

  it('skips mapping checks when a service value is fully tagged', () => {
    const source = `services:
  nginx: !reset null
`
    const issues = lintComposeYaml(source)
    expect(
      issues.some(
        (issue) =>
          issue.path === 'services.nginx' && issue.message.includes('must be a mapping'),
      ),
    ).toBe(false)
    expect(
      issues.some((issue) => issue.message.toLowerCase().includes('unresolved')),
    ).toBe(false)
  })

  it('errors on invalid TurboPanel variable refs in environment', () => {
    const source = `services:
  web:
    image: nginx
    environment:
      BAD: prefix-{$PORT}
      SCOPE: "{$galaxy.KEY}"
      OK: "{$NODE_ENV}"
`
    const issues = lintComposeYaml(source)
    expect(
      issues.some((issue) => issue.path === 'services.web.environment.BAD'),
    ).toBe(true)
    expect(
      issues.some((issue) => issue.path === 'services.web.environment.SCOPE'),
    ).toBe(true)
    expect(
      issues.some((issue) => issue.path === 'services.web.environment.OK'),
    ).toBe(false)
  })
})

describe('railpack-built services', () => {
  const railpackService = `services:
  api:
    x-turbopanel:
      serviceKind: container
      source:
        sourceId: 11111111-2222-3333-4444-555555555555
        buildKind: railpack
`

  it('does not require image or build — the daemon mints the image', () => {
    const issues = lintComposeYaml(railpackService)
    expect(
      issues.some((issue) => issue.message.includes('must define "image"')),
    ).toBe(false)
    expect(blockingComposeLintIssues(issues)).toEqual([])
  })

  it('still requires image or build for a native-built source', () => {
    const source = `services:
  api:
    x-turbopanel:
      serviceKind: container
      source:
        sourceId: 11111111-2222-3333-4444-555555555555
`
    expect(
      lintComposeYaml(source).some((issue) =>
        issue.message.includes('must define "image"'),
      ),
    ).toBe(true)
  })
})

describe('lintComposeYaml source ids and interpolation collections', () => {
  it('errors when knownSourceIds does not contain the bound source', () => {
    const source = `services:
  api:
    image: nginx
    x-turbopanel:
      source:
        sourceId: 11111111-2222-3333-4444-555555555555
`
    const issues = lintComposeYaml(source, {
      knownSourceIds: new Set(['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee']),
    })
    expect(
      issues.some(
        (issue) =>
          issue.level === 'error' &&
          issue.path === 'services.api.x-turbopanel.source.sourceId',
      ),
    ).toBe(true)
    expect(
      lintComposeYaml(source, {
        knownSourceIds: new Set(['11111111-2222-3333-4444-555555555555']),
      }).some((issue) => issue.level === 'error'),
    ).toBe(false)
  })

  it('lints list-form environment values after = or : separators', () => {
    const source = `services:
  web:
    image: nginx
    environment:
      - BAD=prefix-{$PORT}
      - ALSO:prefix-{$PORT}
      - BARE
      - OK={$NODE_ENV}
      - "BOTH=prefix:{$PORT}"
`
    const issues = lintComposeYaml(source)
    expect(
      issues.some((issue) => issue.path === 'services.web.environment[0]'),
    ).toBe(true)
    expect(
      issues.some((issue) => issue.path === 'services.web.environment[1]'),
    ).toBe(true)
    expect(
      issues.some((issue) => issue.path === 'services.web.environment[3]'),
    ).toBe(false)
    expect(
      issues.some((issue) => issue.path === 'services.web.environment[4]'),
    ).toBe(true)
  })

  it('lints build.args maps and sequences', () => {
    const mapped = lintComposeYaml(`services:
  web:
    build:
      context: .
      args:
        TOKEN: prefix-{$KEY}
`)
    expect(
      mapped.some((issue) => issue.path === 'services.web.build.args.TOKEN'),
    ).toBe(true)

    const sequenced = lintComposeYaml(`services:
  web:
    build:
      context: .
      args:
        - TOKEN=prefix-{$KEY}
`)
    expect(
      sequenced.some((issue) => issue.path === 'services.web.build.args[0]'),
    ).toBe(true)
  })

  it('errors when a service value is not a mapping', () => {
    const issues = lintComposeYaml(`services:
  nginx: just-a-string
`)
    expect(
      issues.some(
        (issue) =>
          issue.path === 'services.nginx' &&
          issue.message.includes('must be a mapping'),
      ),
    ).toBe(true)
  })

  it('sorts an error before a warning on the same line', () => {
    const issues = lintComposeYaml(`services:
  web: { imaage: nginx }
`)
    const sameLine = issues.filter((issue) => issue.line === 2)
    expect(sameLine.length).toBeGreaterThan(1)
    expect(sameLine[0]?.level).toBe('error')
  })

  it('skips complex YAML keys that are not strings', () => {
    const issues = lintComposeYaml(`services:
  web:
    image: nginx
    ? [a, b]
    : ignored
`)
    expect(issues.filter((issue) => issue.level === 'error')).toEqual([])
  })

  it('allows a node service without image or build', () => {
    const issues = lintComposeYaml(`services:
  api:
    x-turbopanel:
      serviceKind: node
      framework: auto
`)
    expect(
      issues.some((issue) => issue.message.includes('must define "image"')),
    ).toBe(false)
  })

  it('warns on a source block that is not a mapping and skips empty ids', () => {
    const notAMap = lintComposeYaml(`services:
  api:
    image: nginx
    x-turbopanel:
      source: yes
`)
    expect(
      notAMap.some(
        (issue) =>
          issue.path === 'services.api.x-turbopanel.source' &&
          issue.blocking === false,
      ),
    ).toBe(true)

    const emptyId = lintComposeYaml(
      `services:
  api:
    image: nginx
    x-turbopanel:
      source:
        sourceId: ""
`,
      { knownSourceIds: new Set(['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee']) },
    )
    expect(
      emptyId.some((issue) => issue.level === 'error'),
    ).toBe(false)
  })

  it('treats a tagged image as present and skips a tagged services mapping', () => {
    expect(
      lintComposeYaml(`services:
  web:
    image: !override nginx
`).some((issue) => issue.message.includes('must define "image"')),
    ).toBe(false)

    expect(
      lintComposeYaml(`services: !reset null
`).some((issue) => issue.path === 'services' && issue.level === 'error'),
    ).toBe(false)
  })

  it('warns on unknown keys that have no close suggestion', () => {
    const issues = lintComposeYaml(`zzzzzzzzzz:
  nope: true
services:
  web:
    image: nginx
    zzzzzzzzzz: 1
`)
    expect(
      issues.some(
        (issue) =>
          issue.path === 'zzzzzzzzzz' &&
          issue.message.includes('Unknown top-level key'),
      ),
    ).toBe(true)
    expect(
      issues.some(
        (issue) =>
          issue.path === 'services.web.zzzzzzzzzz' &&
          issue.message.includes('Unknown service key'),
      ),
    ).toBe(true)
  })

  it('treats a null image as missing', () => {
    const issues = lintComposeYaml(`services:
  web:
    image: ~
`)
    expect(
      issues.some(
        (issue) =>
          issue.level === 'error' && issue.path === 'services.web',
      ),
    ).toBe(true)
  })

  it('sorts lineless issues after lined issues', () => {
    const issues = lintComposeYaml(`foo: bar
`)
    const lineless = issues.filter((issue) => issue.line === undefined)
    const lined = issues.filter((issue) => issue.line !== undefined)
    expect(lineless).toHaveLength(1)
    expect(lineless[0]?.path).toBe('$')
    expect(lineless[0]?.message).toContain('no "services"')
    expect(lined.length).toBeGreaterThan(0)
    expect(lined[0]?.path).toBe('foo')
    expect(issues.indexOf(lineless[0]!)).toBeGreaterThan(issues.indexOf(lined[0]!))
  })

  it('maps parse errors without linePos to lineless issues', () => {
    const candidates = [
      `services:\n  nginx:\n  image: nginx\n    ports: bad\n`,
      '\tbad: tab indent\n',
      '{ not yaml\n',
    ]
    let sourceWithoutLinePos: string | null = null
    for (const source of candidates) {
      const doc = parseDocument(source, { prettyErrors: true })
      if (
        doc.errors.length > 0 &&
        doc.errors.every((error) => error.linePos?.[0]?.line === undefined)
      ) {
        sourceWithoutLinePos = source
        break
      }
    }

    if (!sourceWithoutLinePos) {
      // yaml@2.9 attaches linePos on every parser error we can trigger here.
      const issues = lintComposeYaml(`services:\n  [unclosed\n`)
      expect(issues.length).toBeGreaterThan(0)
      expect(issues.every((issue) => typeof issue.line === 'number')).toBe(true)
      return
    }

    const issues = lintComposeYaml(sourceWithoutLinePos)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.every((issue) => issue.line === undefined)).toBe(true)
  })

  it('skips environment values that are not string collections', () => {
    const issues = lintComposeYaml(`services:
  web:
    image: nginx
    environment: ~
    env_file: ignored
  api:
    image: nginx
    environment:
      - { NESTED: "1" }
      - 12
  db:
    image: nginx
    environment:
      PORT: 80
`)
    expect(issues.filter((issue) => issue.level === 'error')).toEqual([])
  })

  it('treats a mapping image and a tagged build as present', () => {
    expect(
      lintComposeYaml(`services:
  web:
    image:
      name: nginx
`).some((issue) => issue.message.includes('must define "image"')),
    ).toBe(false)

    expect(
      lintComposeYaml(`services:
  web:
    build: !override .
`).some((issue) => issue.message.includes('must define "image"')),
    ).toBe(false)
  })

  it('advises on a source map that omits sourceId and skips non-string keys', () => {
    const issues = lintComposeYaml(`? [a, b]
: ignored
services:
  ? [c, d]
  :
    image: nginx
  api:
    image: nginx
    x-turbopanel:
      source:
        branch: main
`)
    expect(
      issues.some(
        (issue) =>
          issue.path === 'services.api.x-turbopanel.source' &&
          issue.blocking === false,
      ),
    ).toBe(true)
    expect(issues.filter((issue) => issue.level === 'error')).toEqual([])
  })
})

describe('compose key classifiers', () => {
  it('identifies top-level keys and service-only properties', () => {
    expect(isComposeTopLevelKey('services')).toBe(true)
    expect(isComposeTopLevelKey('image')).toBe(false)
    expect(isComposeServicePropertyKey('restart')).toBe(true)
    expect(isComposeServicePropertyKey('image')).toBe(true)
    expect(isComposeServicePropertyKey('networks')).toBe(false)
    expect(isComposeServicePropertyKey('zzzz')).toBe(false)
  })
})
