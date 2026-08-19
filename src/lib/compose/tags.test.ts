import { parseDocument } from 'yaml'
import { describe, expect, it } from 'vitest'
import {
  COMPOSE_CUSTOM_TAGS,
  COMPOSE_TAG_KEY,
  COMPOSE_YAML_OPTIONS,
  composeTagOf,
  isComposeTaggedValue,
  makeComposeTag,
  resolveComposeTags,
  unwrapComposeTag,
} from './tags'

describe('compose tag sentinels', () => {
  it('recognizes tagged values and unwraps nested tags', () => {
    const tagged = makeComposeTag('override', makeComposeTag('reset', ['a']))
    expect(isComposeTaggedValue(tagged)).toBe(true)
    expect(composeTagOf(tagged)).toBe('override')
    expect(unwrapComposeTag(tagged)).toEqual(makeComposeTag('reset', ['a']))
    expect(resolveComposeTags(tagged)).toEqual(['a'])
  })

  it('rejects non-sentinel shapes', () => {
    expect(isComposeTaggedValue(null)).toBe(false)
    expect(isComposeTaggedValue({ value: 1 })).toBe(false)
    expect(isComposeTaggedValue({ [COMPOSE_TAG_KEY]: 'bogus', value: 1 })).toBe(false)
    expect(composeTagOf({ image: 'nginx' })).toBeNull()
    expect(unwrapComposeTag('plain')).toBe('plain')
  })

  it('resolveComposeTags walks arrays and plain objects', () => {
    const nested = {
      ports: makeComposeTag('override', ['80:80']),
      labels: ['a=b'],
      nested: { env: makeComposeTag('reset', { FOO: '1' }) },
    }
    expect(resolveComposeTags(nested)).toEqual({
      ports: ['80:80'],
      labels: ['a=b'],
      nested: { env: { FOO: '1' } },
    })
  })
})

describe('COMPOSE_CUSTOM_TAGS schema', () => {
  it('parses scalar, map, and sequence tag bodies', () => {
    const scalar = COMPOSE_CUSTOM_TAGS.find(
      (tag) => tag.tag === '!reset' && !('collection' in tag),
    )
    const mapTag = COMPOSE_CUSTOM_TAGS.find(
      (tag) => tag.tag === '!override' && 'collection' in tag && tag.collection === 'map',
    )
    const seqTag = COMPOSE_CUSTOM_TAGS.find(
      (tag) => tag.tag === '!override' && 'collection' in tag && tag.collection === 'seq',
    )
    if (!scalar || !mapTag || !seqTag) {
      throw new TypeError('expected scalar, map, and sequence compose tags')
    }

    const nullDoc = parseDocument('!reset\n~', COMPOSE_YAML_OPTIONS)
    expect(nullDoc.errors).toEqual([])
    expect(nullDoc.toJSON()).toEqual(makeComposeTag('reset', null))

    const trueDoc = parseDocument('!reset\ntrue', COMPOSE_YAML_OPTIONS)
    expect(trueDoc.errors).toEqual([])
    expect(trueDoc.toJSON()).toEqual(makeComposeTag('reset', true))

    const helloDoc = parseDocument('!reset\nhello', COMPOSE_YAML_OPTIONS)
    expect(helloDoc.errors).toEqual([])
    expect(helloDoc.toJSON()).toEqual(makeComposeTag('reset', 'hello'))

    const mapDoc = parseDocument('!override\n  key: value\n', COMPOSE_YAML_OPTIONS)
    expect(mapDoc.errors).toEqual([])
    expect(mapDoc.toJSON()).toEqual(makeComposeTag('override', { key: 'value' }))

    const seqDoc = parseDocument('!reset\n  - one\n  - two\n', COMPOSE_YAML_OPTIONS)
    expect(seqDoc.errors).toEqual([])
    expect(seqDoc.toJSON()).toEqual(makeComposeTag('reset', ['one', 'two']))
  })
})
