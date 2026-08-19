import { describe, expect, it } from 'vitest'
import { blockingComposeLintIssues, lintComposeYaml } from './lint'

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

  it('allows traditional-web services without image or build', () => {
    const source = `services:
  site:
    x-turbopanel:
      serviceKind: traditional-web
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

  it('allows traditional-web services without image or build when listed via options', () => {
    const source = `services:
  site: {}
`
    expect(
      lintComposeYaml(source, { traditionalWebServices: ['site'] }),
    ).toEqual([])
  })

  it('still errors for missing image when traditionalWebServices omits the service', () => {
    const source = `services:
  site: {}
`
    const issues = lintComposeYaml(source, {
      traditionalWebServices: ['other'],
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

  it('still errors for missing image when author types traditional-web under managedExtensionHidden', () => {
    const source = `services:
  site:
    x-turbopanel:
      serviceKind: traditional-web
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
