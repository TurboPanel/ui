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

  it('skips complex mapping keys while coercing boolean keys', () => {
    const source = `true: keep
[bad]: skip
services:
  web:
    image: nginx
`
    const doc = yamlToComposeDocument(source)
    expect(Object.hasOwn(doc.data, 'true')).toBe(true)
    expect(Object.hasOwn(doc.data, '[bad]')).toBe(false)
    expect(doc.presentation.keyOrder).toEqual(['true', 'services'])
    expect(composeDocumentToYaml(doc)).toContain('keep')
  })

  it('uses data keys when a tagged scalar root has no mapping keyOrder', () => {
    const doc = yamlToComposeDocument('!reset null\n')
    expect(doc.presentation.keyOrder.length).toBeGreaterThan(0)
    expect(doc.presentation.keyOrder).toEqual(Object.keys(doc.data))
    expect(doc.data).toMatchObject({
      [COMPOSE_TAG_KEY]: 'reset',
    })
    expect(Object.hasOwn(doc.data, 'value')).toBe(true)
  })

  it('round-trips key inline comments and node blank lines', () => {
    const source = `services:
  web:
    image: nginx
`
    const doc = yamlToComposeDocument(source)
    doc.presentation.comments.services = {
      keyInline: 'inline key note',
    }
    doc.presentation.blankLines = { services: 1 }

    const yaml = composeDocumentToYaml(doc)
    expect(yaml).toContain('inline key note')
    expect(yaml).toContain('services:')
  })

  it('collects and reapplies keyBefore comments from YAML', () => {
    const source = `# services section
services:
  web:
    image: nginx
# trailing note
`
    const doc = yamlToComposeDocument(source)
    expect(doc.presentation.comments.services?.keyBefore).toContain('services section')
    expect(doc.presentation.documentComment).toContain('trailing note')

    const yaml = composeDocumentToYaml(doc)
    expect(yaml).toContain('# services section')
    expect(yaml).toContain('# trailing note')
  })

  it('skips missing keyOrder entries and empty keyOrder on stringify', () => {
    const doc = yamlToComposeDocument(`services:
  web:
    image: nginx
`)
    doc.presentation.keyOrder = ['networks', 'services']
    const reordered = composeDocumentToYaml(doc)
    expect(reordered).toContain('services:')
    expect(reordered).not.toContain('networks:')

    doc.presentation.keyOrder = []
    expect(composeDocumentToYaml(doc)).toContain('services:')
  })

  it('preserves blank lines before sequence items through stringify', () => {
    const source = `services:
  web:
    image: nginx
    ports:

      - "80:80"
`
    const doc = yamlToComposeDocument(source)
    expect(doc.presentation.blankLines).toBeDefined()
    const blanks = doc.presentation.blankLines
    if (!blanks) {
      throw new TypeError('expected blankLines on sequence item')
    }
    expect(Object.values(blanks).some((count) => count > 0)).toBe(true)

    const yaml = composeDocumentToYaml(doc)
    expect(yaml).toContain('80:80')
    expect(yaml).toMatch(/ports:[\s\S]*80:80/)
  })

  it('applies key blankLines through spaceBefore', () => {
    const source = `services:
  web:
    image: nginx
`
    const doc = yamlToComposeDocument(source)
    doc.presentation.blankLines = { 'services#key': 1 }
    const yaml = composeDocumentToYaml(doc)
    expect(yaml).toContain('services:')
  })

  it('reorders top-level keys from presentation keyOrder', () => {
    const doc = yamlToComposeDocument(`version: "3.9"
services:
  web:
    image: nginx
networks:
  front: {}
`)
    doc.presentation.keyOrder = ['networks', 'services', 'version']
    const yaml = composeDocumentToYaml(doc)
    expect(yaml.indexOf('networks:')).toBeLessThan(yaml.indexOf('services:'))
    expect(yaml.indexOf('services:')).toBeLessThan(yaml.indexOf('version:'))
  })

  it('skips a null mapping key when collecting keyOrder', () => {
    const source = `~: leftover
services:
  web:
    image: nginx
`
    const doc = yamlToComposeDocument(source)
    expect(doc.presentation.keyOrder).toContain('services')
    const yaml = composeDocumentToYaml(doc)
    expect(yaml).toContain('services:')
    expect(yaml).toContain('nginx')
  })

  it('reads a sentinel value that is a YAML alias rather than a collection', () => {
    const shared = { PORT: '8080' }
    const doc: ComposeDocument = {
      version: 1,
      data: {
        services: {
          web: {
            image: 'nginx',
            labels: shared,
            environment: {
              [COMPOSE_TAG_KEY]: 'override',
              value: shared,
            },
          },
        },
      },
      presentation: { keyOrder: ['services'], comments: {} },
    }
    expect(() => composeDocumentToYaml(doc)).toThrow(/Alias nodes cannot have tags/)
  })
})
