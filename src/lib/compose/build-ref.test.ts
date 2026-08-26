import { describe, expect, it } from 'vitest'
import {
  clearComposeBuildInline,
  DEFAULT_INLINE_DOCKERFILE,
  dockerfileHasFromInstruction,
  emptyComposeBuildRef,
  parseComposeBuild,
  setComposeBuildInline,
} from './build-ref'

describe('parseComposeBuild', () => {
  it('parses string shorthand as external', () => {
    expect(parseComposeBuild('.')).toEqual({
      kind: 'external',
      context: '.',
      dockerfileInline: '',
      dockerfilePath: '',
    })
    expect(parseComposeBuild('./app')).toEqual({
      kind: 'external',
      context: './app',
      dockerfileInline: '',
      dockerfilePath: '',
    })
  })

  it('parses long-form dockerfile_inline as inline', () => {
    expect(
      parseComposeBuild({
        context: '.',
        dockerfile_inline: 'FROM alpine\n',
      }),
    ).toEqual({
      kind: 'inline',
      context: '.',
      dockerfileInline: 'FROM alpine\n',
      dockerfilePath: '',
    })
  })

  it('keeps empty dockerfile_inline as inline (not external)', () => {
    expect(
      parseComposeBuild({
        context: '.',
        dockerfile_inline: '',
      }),
    ).toEqual({
      kind: 'inline',
      context: '.',
      dockerfileInline: '',
      dockerfilePath: '',
    })
  })

  it('parses path-based / context-only as external', () => {
    expect(
      parseComposeBuild({
        context: './svc',
        dockerfile: 'Dockerfile.prod',
      }),
    ).toEqual({
      kind: 'external',
      context: './svc',
      dockerfileInline: '',
      dockerfilePath: 'Dockerfile.prod',
    })
    expect(parseComposeBuild({ context: '.' })).toEqual({
      kind: 'external',
      context: '.',
      dockerfileInline: '',
      dockerfilePath: '',
    })
  })

  it('returns none for empty or invalid values', () => {
    expect(parseComposeBuild(undefined).kind).toBe('none')
    expect(parseComposeBuild(null).kind).toBe('none')
    expect(parseComposeBuild({}).kind).toBe('none')
    expect(parseComposeBuild(42).kind).toBe('none')
    expect(parseComposeBuild('   ')).toEqual(emptyComposeBuildRef())
    expect(parseComposeBuild([]).kind).toBe('none')
  })

  it('defaults missing inline context to .', () => {
    expect(
      parseComposeBuild({
        dockerfile_inline: 'FROM alpine\n',
      }),
    ).toEqual({
      kind: 'inline',
      context: '.',
      dockerfileInline: 'FROM alpine\n',
      dockerfilePath: '',
    })
  })

  it('defaults missing path-based context to .', () => {
    expect(
      parseComposeBuild({
        dockerfile: 'Dockerfile.prod',
      }),
    ).toEqual({
      kind: 'external',
      context: '.',
      dockerfileInline: '',
      dockerfilePath: 'Dockerfile.prod',
    })
  })
})

describe('setComposeBuildInline / clearComposeBuildInline', () => {
  it('round-trips inline while preserving args and target', () => {
    const next = setComposeBuildInline(
      { context: './src', args: { NODE_ENV: 'production' }, target: 'runtime' },
      'FROM node:22\n',
    )
    expect(next).toEqual({
      context: './src',
      args: { NODE_ENV: 'production' },
      target: 'runtime',
      dockerfile_inline: 'FROM node:22\n',
    })
    expect(Object.hasOwn(next, 'dockerfile')).toBe(false)
  })

  it('defaults context to . and removes conflicting dockerfile path', () => {
    const next = setComposeBuildInline(
      { dockerfile: 'Dockerfile' },
      DEFAULT_INLINE_DOCKERFILE,
    )
    expect(next.context).toBe('.')
    expect(next.dockerfile_inline).toBe(DEFAULT_INLINE_DOCKERFILE)
    expect(Object.hasOwn(next, 'dockerfile')).toBe(false)
  })

  it('converts external mapping to inline while preserving context, args, and target', () => {
    const next = setComposeBuildInline(
      {
        context: './app',
        dockerfile: 'Dockerfile.prod',
        args: { NODE_ENV: 'production' },
        target: 'runtime',
        ssh: ['default'],
      },
      DEFAULT_INLINE_DOCKERFILE,
    )
    expect(next).toEqual({
      context: './app',
      args: { NODE_ENV: 'production' },
      target: 'runtime',
      ssh: ['default'],
      dockerfile_inline: DEFAULT_INLINE_DOCKERFILE,
    })
    expect(Object.hasOwn(next, 'dockerfile')).toBe(false)
  })

  it('promotes string shorthand context when writing inline', () => {
    const next = setComposeBuildInline('./app', 'FROM alpine\n')
    expect(next).toEqual({
      context: './app',
      dockerfile_inline: 'FROM alpine\n',
    })
  })

  it('converts string shorthand external build without dropping other keys later', () => {
    const next = setComposeBuildInline('.', DEFAULT_INLINE_DOCKERFILE)
    expect(next.context).toBe('.')
    expect(next.dockerfile_inline).toBe(DEFAULT_INLINE_DOCKERFILE)
    expect(Object.hasOwn(next, 'dockerfile')).toBe(false)
  })

  it('clear returns undefined when only default context remains', () => {
    expect(
      clearComposeBuildInline({
        context: '.',
        dockerfile_inline: 'FROM alpine\n',
      }),
    ).toBeUndefined()
    expect(
      clearComposeBuildInline({ dockerfile_inline: 'FROM alpine\n' }),
    ).toBeUndefined()
  })

  it('clear keeps remaining non-default keys', () => {
    expect(
      clearComposeBuildInline({
        context: './svc',
        dockerfile_inline: 'FROM alpine\n',
        args: { A: '1' },
      }),
    ).toEqual({
      context: './svc',
      args: { A: '1' },
    })
  })

  it('clear returns undefined for string shorthand and non-mappings', () => {
    expect(clearComposeBuildInline('.')).toBeUndefined()
    expect(clearComposeBuildInline(null)).toBeUndefined()
    expect(clearComposeBuildInline('   ')).toBeUndefined()
  })
})

describe('dockerfileHasFromInstruction', () => {
  it('detects FROM lines, ignoring comments', () => {
    expect(dockerfileHasFromInstruction('# comment\nFROM alpine\n')).toBe(true)
    expect(dockerfileHasFromInstruction('WORKDIR /app\n')).toBe(false)
    expect(dockerfileHasFromInstruction('from ubuntu:24.04\n')).toBe(true)
    expect(dockerfileHasFromInstruction('\n  \n# only comments\n')).toBe(false)
    expect(dockerfileHasFromInstruction('')).toBe(false)
    expect(dockerfileHasFromInstruction('FROM')).toBe(true)
  })
})
