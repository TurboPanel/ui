import { describe, expect, it } from 'vitest'
import {
  applyNewlineAutoIndent,
  applyTabIndent,
  applyTabOutdent,
  fixComposeYamlIndentation,
  indentAfterNewline,
  lineOpensBlock,
  trimTrailingWhitespacePerLine,
  YAML_INDENT,
} from './yaml-indent'

describe('lineOpensBlock', () => {
  it('detects bare mapping keys', () => {
    expect(lineOpensBlock('services:')).toBe(true)
    expect(lineOpensBlock('  nginx:')).toBe(true)
    expect(lineOpensBlock('    ports:')).toBe(true)
  })

  it('ignores keys with same-line values', () => {
    expect(lineOpensBlock('    image: nginx')).toBe(false)
    expect(lineOpensBlock('  - "80:80"')).toBe(false)
  })

  it('ignores trailing comments when deciding', () => {
    expect(lineOpensBlock('services: # top')).toBe(true)
    expect(lineOpensBlock('    image: nginx # web')).toBe(false)
  })
})

describe('indentAfterNewline', () => {
  it('increases indent after a block opener', () => {
    expect(indentAfterNewline('services:')).toBe(YAML_INDENT)
    expect(indentAfterNewline('  nginx:')).toBe(`  ${YAML_INDENT}`)
  })

  it('keeps indent after a completed key/value line', () => {
    expect(indentAfterNewline('    image: nginx')).toBe('    ')
  })
})

describe('applyNewlineAutoIndent', () => {
  it('indents the next line after services:', () => {
    const prev = 'services:'
    const next = 'services:\n'
    expect(applyNewlineAutoIndent(prev, next)).toEqual({
      text: 'services:\n  ',
      selection: { start: 12, end: 12 },
    })
  })

  it('nests under a service key', () => {
    const prev = 'services:\n  nginx:'
    const next = 'services:\n  nginx:\n'
    const result = applyNewlineAutoIndent(prev, next)
    expect(result?.text).toBe('services:\n  nginx:\n    ')
    expect(result?.selection).toEqual({ start: 23, end: 23 })
  })

  it('keeps indent after image: nginx', () => {
    const prev = 'services:\n  nginx:\n    image: nginx'
    const next = 'services:\n  nginx:\n    image: nginx\n'
    const result = applyNewlineAutoIndent(prev, next)
    expect(result?.text).toBe('services:\n  nginx:\n    image: nginx\n    ')
  })

  it('re-indents a misplaced service key like restart on Enter', () => {
    const prev = `services:
  nginx:
    image: nginx
restart: always # hehe`
    const next = `${prev}\n`
    const result = applyNewlineAutoIndent(prev, next)
    expect(result?.text).toBe(`services:
  nginx:
    image: nginx
    restart: always # hehe
    `)
  })

  it('re-indents restart left at the service-name column', () => {
    const prev = `services:
  nginx:
    image: nginx
  restart: always`
    const next = `${prev}\n`
    const result = applyNewlineAutoIndent(prev, next)
    expect(result?.text).toBe(`services:
  nginx:
    image: nginx
    restart: always
    `)
  })

  it('does not pull top-level networks into a service', () => {
    const prev = `services:
  nginx:
    image: nginx
networks:`
    const next = `${prev}\n`
    const result = applyNewlineAutoIndent(prev, next)
    expect(result?.text).toBe(`services:
  nginx:
    image: nginx
networks:
  `)
  })

  it('right-trims every line when leaving via Enter', () => {
    const prev = 'services:  \n  nginx:  \n    image: nginx   '
    const next = `${prev}\n`
    const result = applyNewlineAutoIndent(prev, next)
    expect(result?.text).toBe('services:\n  nginx:\n    image: nginx\n    ')
  })

  it('returns null for non-newline edits', () => {
    expect(applyNewlineAutoIndent('services:', 'services:x')).toBeNull()
    expect(applyNewlineAutoIndent('a', 'ab')).toBeNull()
  })

  it('returns null when no indent or trim is needed', () => {
    expect(applyNewlineAutoIndent('image: nginx', 'image: nginx\n')).toBeNull()
  })
})

describe('trimTrailingWhitespacePerLine', () => {
  it('strips spaces and tabs at end of each line', () => {
    expect(trimTrailingWhitespacePerLine('a  \n  b\t\n c')).toBe('a\n  b\n c')
  })
})

describe('fixComposeYamlIndentation', () => {
  it('nests service names and properties under services', () => {
    const broken = `services:
nginx:
  image: nginx`
    const fixed = fixComposeYamlIndentation(broken)
    expect(fixed?.text).toBe(`services:
  nginx:
    image: nginx`)
    expect(fixed?.selection).toEqual({
      start: fixed?.text.length ?? 0,
      end: fixed?.text.length ?? 0,
    })
  })

  it('does not pull a new top-level section into a service', () => {
    const source = `services:
  nginx:
    image: nginx
networks:
  front: {}`
    expect(fixComposeYamlIndentation(source)).toBeNull()
  })

  it('returns null when indentation is already valid', () => {
    const source = `services:
  nginx:
    image: nginx`
    expect(fixComposeYamlIndentation(source)).toBeNull()
  })
})

describe('applyTabIndent / applyTabOutdent', () => {
  it('inserts two spaces at the caret', () => {
    expect(applyTabIndent('nginx:', { start: 0, end: 0 })).toEqual({
      text: '  nginx:',
      selection: { start: 2, end: 2 },
    })
  })

  it('indents the whole line when the caret is in leading whitespace', () => {
    expect(applyTabIndent('nginx:\nimage: nginx', { start: 7, end: 7 })).toEqual({
      text: 'nginx:\n  image: nginx',
      selection: { start: 9, end: 9 },
    })
  })

  it('indents every selected line', () => {
    const text = 'services:\nnginx:\nimage: nginx\n'
    const result = applyTabIndent(text, { start: 10, end: 28 })
    expect(result.text).toBe('services:\n  nginx:\n  image: nginx\n')
  })

  it('outdents the current line', () => {
    expect(applyTabOutdent('  nginx:', { start: 4, end: 4 })).toEqual({
      text: 'nginx:',
      selection: { start: 2, end: 2 },
    })
  })
})
