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

  it('warns when there are no services', () => {
    const source = `networks:
  default: {}
`
    const issues = lintComposeYaml(source)
    expect(issues.some((issue) => issue.message.includes('no "services"'))).toBe(true)
  })
})
