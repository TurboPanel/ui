import { describe, expect, it } from 'vitest'
import { composeDocumentToYaml, yamlToComposeDocument } from './index'
import {
  addableVisualFields,
  formatComposeRestart,
  parseComposeRestart,
  serviceHasVisualField,
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
    expect(formatComposeRestart('no')).toBe('no')
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
    ])
    expect(
      addableVisualFields({ image: 'nginx', restart: 'always' }).map((f) => f.id),
    ).toEqual([])
  })

  it('detects presence for round-trip fields even when not offered', () => {
    const ports = VISUAL_SERVICE_FIELDS.find((f) => f.id === 'ports')
    expect(ports?.offerAdd).toBe(false)
    expect(serviceHasVisualField({ ports: ['8080:80'] }, ports!)).toBe(true)
    expect(serviceHasVisualField({ image: 'nginx' }, ports!)).toBe(false)
  })
})
