import { describe, expect, it } from 'vitest'
import { composeDocumentToYaml, yamlToComposeDocument } from './index'
import {
  addableVisualFields,
  formatComposeRestart,
  isComposeRestartPolicy,
  parseComposeRestart,
  serviceHasVisualField,
  visualFieldById,
  VISUAL_SERVICE_FIELDS,
} from './visual-fields'

describe('compose restart (Compose Spec)', () => {
  it('parses every short-form policy', () => {
    expect(parseComposeRestart('no')).toEqual({ policy: 'no', maxRetries: null })
    expect(parseComposeRestart('always')).toEqual({
      policy: 'always',
      maxRetries: null,
    })
    expect(parseComposeRestart('unless-stopped')).toEqual({
      policy: 'unless-stopped',
      maxRetries: null,
    })
    expect(parseComposeRestart('on-failure')).toEqual({
      policy: 'on-failure',
      maxRetries: null,
    })
    expect(parseComposeRestart('on-failure:3')).toEqual({
      policy: 'on-failure',
      maxRetries: 3,
    })
  })

  it('treats YAML boolean false as restart: "no"', () => {
    expect(parseComposeRestart(false)).toEqual({ policy: 'no', maxRetries: null })
  })

  it('formats on-failure with optional max retries', () => {
    expect(formatComposeRestart('always')).toBe('always')
    expect(formatComposeRestart('on-failure')).toBe('on-failure')
    expect(formatComposeRestart('on-failure', null)).toBe('on-failure')
    expect(formatComposeRestart('on-failure', 3)).toBe('on-failure:3')
    expect(formatComposeRestart('on-failure', -1)).toBe('on-failure')
    expect(formatComposeRestart('on-failure', Number.NaN)).toBe('on-failure')
    expect(formatComposeRestart('no')).toBe('no')
  })

  it('rejects invalid restart values', () => {
    expect(parseComposeRestart(null)).toBeNull()
    expect(parseComposeRestart('invalid')).toBeNull()
    expect(parseComposeRestart('on-failure:-1')).toBeNull()
    expect(parseComposeRestart('ON-FAILURE:2')).toEqual({
      policy: 'on-failure',
      maxRetries: 2,
    })
  })

  it('recognizes compose restart policy literals', () => {
    expect(isComposeRestartPolicy('always')).toBe(true)
    expect(isComposeRestartPolicy('sometimes')).toBe(false)
  })

  it('round-trips restart: "no" through YAML without becoming boolean false', () => {
    const doc = yamlToComposeDocument(`services:
  web:
    image: nginx
    restart: always
`)
    const services = doc.data.services as Record<string, Record<string, unknown>>
    services.web.restart = 'no'
    const yaml = composeDocumentToYaml(doc)
    expect(yaml).toMatch(/restart:\s*["']?no["']?/)
    const back = yamlToComposeDocument(yaml)
    const web = (back.data.services as Record<string, Record<string, unknown>>).web
    expect(parseComposeRestart(web.restart)).toEqual({
      policy: 'no',
      maxRetries: null,
    })
  })
})

describe('visual field catalog', () => {
  it('offers only fields with offerAdd when absent', () => {
    expect(addableVisualFields({ image: 'nginx' }).map((f) => f.id)).toEqual([
      'restart',
      'container_name',
      'build',
    ])
    expect(
      addableVisualFields({ image: 'nginx', restart: 'always' }).map((f) => f.id),
    ).toEqual(['container_name', 'build'])
    expect(
      addableVisualFields({
        image: 'nginx',
        restart: 'always',
        build: { context: '.', dockerfile_inline: 'FROM alpine\n' },
      }).map((f) => f.id),
    ).toEqual(['container_name'])
    expect(
      addableVisualFields({
        image: 'nginx',
        restart: 'always',
        container_name: 'web',
        build: { context: '.', dockerfile_inline: 'FROM alpine\n' },
      }).map((f) => f.id),
    ).toEqual([])
  })

  it('detects presence for round-trip fields even when not offered', () => {
    const ports = VISUAL_SERVICE_FIELDS.find((f) => f.id === 'ports')
    expect(ports?.offerAdd).toBe(false)
    expect(serviceHasVisualField({ ports: ['8080:80'] }, ports!)).toBe(true)
    expect(serviceHasVisualField({ image: 'nginx' }, ports!)).toBe(false)
  })

  it('registers the Dockerfile (build) field for add/remove plumbing', () => {
    const build = VISUAL_SERVICE_FIELDS.find((f) => f.id === 'build')
    expect(build).toMatchObject({
      id: 'build',
      key: 'build',
      label: 'Dockerfile',
      offerAdd: true,
    })
    expect(serviceHasVisualField({ image: 'nginx' }, build!)).toBe(false)
    expect(
      serviceHasVisualField(
        { build: { context: '.', dockerfile_inline: 'FROM alpine\n' } },
        build!,
      ),
    ).toBe(true)
    expect(
      addableVisualFields({ image: 'nginx' }).some((f) => f.id === 'build'),
    ).toBe(true)
  })

  it('throws for unknown visual field ids', () => {
    expect(() => visualFieldById('missing' as 'restart')).toThrow(TypeError)
    expect(() => visualFieldById('missing' as 'restart')).toThrow(
      /Unknown visual field/,
    )
  })
})
