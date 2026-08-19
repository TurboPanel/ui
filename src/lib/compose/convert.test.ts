import { describe, expect, it } from 'vitest'
import {
  ComposeParseError,
  composeDocumentToYaml,
  yamlToComposeDocument,
} from './convert'

describe('yamlToComposeDocument errors', () => {
  it('throws ComposeParseError for invalid YAML', () => {
    expect(() => yamlToComposeDocument('services:\n  [unclosed')).toThrow(ComposeParseError)
    try {
      yamlToComposeDocument('services:\n  [unclosed')
    } catch (error) {
      expect(error).toBeInstanceOf(ComposeParseError)
      expect((error as ComposeParseError).name).toBe('ComposeParseError')
      expect((error as ComposeParseError).message.length).toBeGreaterThan(0)
    }
  })

  it('throws when the document root is not a mapping', () => {
    expect(() => yamlToComposeDocument('- not-a-map\n')).toThrow(ComposeParseError)
    expect(() => yamlToComposeDocument('- not-a-map\n')).toThrow(
      /root must be a mapping/,
    )
  })

  it('preserves key comments on nested service fields', () => {
    const source = `services:
  nginx:
    image: nginx # pinned
`
    const doc = yamlToComposeDocument(source)
    expect(doc.presentation.comments['services.nginx.image']?.inline).toContain('pinned')
    expect(composeDocumentToYaml(doc)).toContain('# pinned')
  })

  it('filters keyOrder to keys that still exist after pruning', () => {
    const source = `networks:
  front: {}
services: {}
`
    const doc = yamlToComposeDocument(source)
    expect(doc.presentation.keyOrder).toEqual(['networks'])
    expect(doc.data).toEqual({
      networks: { front: {} },
    })
  })
})
