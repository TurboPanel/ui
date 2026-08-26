import { describe, expect, it } from 'vitest'
import {
  ComposeParseError,
  composeDocumentToRuntimeYaml,
  composeDocumentToYaml,
  yamlToComposeDocument,
} from './convert'
import { COMPOSE_TAG_KEY, makeComposeTag } from './tags'
import type { ComposeDocument } from './types'

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

  it('round-trips document comments, blank lines, and key comments', () => {
    const source = `# header

services:
  nginx:
    # pinned
    image: nginx
# footer
`
    const doc = yamlToComposeDocument(source)
    const yaml = composeDocumentToYaml(doc)
    expect(yaml).toContain('# header')
    expect(yaml).toContain('# pinned')
    expect(yaml).toContain('# footer')
  })

  it('preserves numeric and boolean mapping keys', () => {
    const source = `services:
  web:
    image: nginx
    labels:
      1: numeric
      true: flagged
`
    const doc = yamlToComposeDocument(source)
    const web = doc.data.services as Record<string, Record<string, unknown>>
    expect(web.web.labels).toMatchObject({ '1': 'numeric', true: 'flagged' })
    const yaml = composeDocumentToYaml(doc)
    expect(yaml).toContain('numeric')
    expect(yaml).toContain('flagged')
  })

  it('moves x-turbopanel after native keys in runtime YAML', () => {
    const doc = yamlToComposeDocument(`x-turbopanel:
  placement:
    server_id: 11111111-1111-4111-8111-111111111111
services:
  web:
    image: nginx
`)
    const runtime = composeDocumentToRuntimeYaml(doc)
    expect(runtime.indexOf('services:')).toBeLessThan(
      runtime.indexOf('x-turbopanel:'),
    )
    expect(composeDocumentToRuntimeYaml(yamlToComposeDocument(''))).toBe('')
  })

  it('round-trips sequence item comments and blank lines', () => {
    const source = `services:
  web:
    image: nginx

    ports:
      - "80:80" # http
`
    const doc = yamlToComposeDocument(source)
    expect(doc.presentation.blankLines).toBeDefined()
    const yaml = composeDocumentToYaml(doc)
    expect(yaml).toContain('# http')
  })

  it('round-trips tagged overlay sentinels', () => {
    const source = `services:
  web:
    image: nginx
    environment: !reset null
    ports: !override
      - "443:443"
`
    const doc = yamlToComposeDocument(source)
    const yaml = composeDocumentToYaml(doc)
    expect(yaml).toContain('environment: !reset')
    expect(yaml).toContain('ports: !override')
    expect(composeDocumentToRuntimeYaml(doc)).toContain('!reset')
  })

  it('returns an empty document for a blank mapping', () => {
    expect(yamlToComposeDocument('{}').data).toEqual({})
    expect(yamlToComposeDocument('   ').data).toEqual({})
  })

  it('does not retag incomplete sentinel maps (single-key or extra keys)', () => {
    const incompleteTagOnly: ComposeDocument = {
      version: 1,
      data: {
        services: {
          web: {
            image: 'nginx',
            environment: { [COMPOSE_TAG_KEY]: 'reset' },
          },
        },
      },
      presentation: { keyOrder: ['services'], comments: {} },
    }
    const tagOnlyYaml = composeDocumentToYaml(incompleteTagOnly)
    expect(tagOnlyYaml).toContain('environment:')
    expect(tagOnlyYaml).not.toContain('environment: !reset')

    const incompleteExtraKey: ComposeDocument = {
      version: 1,
      data: {
        services: {
          web: {
            image: 'nginx',
            ports: {
              [COMPOSE_TAG_KEY]: 'override',
              value: ['443:443'],
              stray: true,
            },
          },
        },
      },
      presentation: { keyOrder: ['services'], comments: {} },
    }
    const extraKeyYaml = composeDocumentToYaml(incompleteExtraKey)
    expect(extraKeyYaml).toContain('ports:')
    expect(extraKeyYaml).not.toContain('ports: !override')
  })

  it('applies document comments when the root retags to a scalar sentinel', () => {
    const doc: ComposeDocument = {
      version: 1,
      data: makeComposeTag('reset', null) as Record<string, unknown>,
      presentation: {
        keyOrder: [],
        comments: {},
        documentCommentBefore: '# head',
        documentComment: '# foot',
      },
    }
    const yaml = composeDocumentToYaml(doc)
    expect(yaml).toContain('# head')
    expect(yaml).toContain('# foot')
    expect(yaml).toMatch(/# head[\s\S]*!reset/)
    expect(composeDocumentToRuntimeYaml(doc)).toContain('!reset')
  })
})
