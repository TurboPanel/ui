import { describe, expect, it } from 'vitest'
import {
  applyNewlineAutoIndent,
  applyTabIndent,
  applyTabOutdent,
  canFixComposeYamlIndentation,
  expectedIndentForCommentLine,
  expectedIndentForLine,
  expectedServicePropertyIndent,
  fixComposeYamlIndentation,
  fixUnderIndentedServiceKeyLine,
  formatComposeYamlOnLineChange,
  indentAfterNewline,
  isFullLineComment,
  leadingWhitespace,
  lineIndexAtOffset,
  lineOpensBlock,
  mapOffsetThroughPerLineTrim,
  parseYamlMappingKey,
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

  it('rejects empty lines and one-line flow collections', () => {
    expect(lineOpensBlock('')).toBe(false)
    expect(lineOpensBlock('   ')).toBe(false)
    expect(lineOpensBlock('items: {')).toBe(false)
    expect(lineOpensBlock('items: [')).toBe(false)
    expect(lineOpensBlock('items: foo,')).toBe(false)
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

describe('formatComposeYamlOnLineChange', () => {
  it('returns null when nothing needs formatting', () => {
    const text = `services:
  nginx:
    image: nginx`
    expect(
      formatComposeYamlOnLineChange(text, { start: text.length, end: text.length }),
    ).toBeNull()
  })

  it('right-trims and fixes under-indent when leaving a line', () => {
    const text = `services:
  nginx:
image: nginx  
`
    const caret = text.length
    const result = formatComposeYamlOnLineChange(text, {
      start: caret,
      end: caret,
    })
    expect(result?.text).toBe(`services:
  nginx:
    image: nginx
`)
  })

  it('ignores multi-character selections', () => {
    const text = `services:
nginx:`
    expect(
      formatComposeYamlOnLineChange(text, { start: 0, end: text.length }),
    ).toBeNull()
  })

  it('leaves a newly-typed sibling service name alone on caret move', () => {
    const text = `services:
  nginx:
    image: nginx
  another:`
    const caret = text.length
    expect(
      formatComposeYamlOnLineChange(text, { start: caret, end: caret }),
    ).toBeNull()
  })

  it('right-trims without rewriting already-valid indent', () => {
    const text = `services:
  nginx:
    image: nginx   `
    const result = formatComposeYamlOnLineChange(text, {
      start: text.length,
      end: text.length,
    })
    expect(result?.text).toBe(`services:
  nginx:
    image: nginx`)
    expect(result?.selection.start).toBeLessThan(text.length)
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

  it('indents full-line comments to match the following content', () => {
    const broken = `services:
# web app
nginx:
# image tag
image: nginx`
    const fixed = fixComposeYamlIndentation(broken)
    expect(fixed?.text).toBe(`services:
  # web app
  nginx:
    # image tag
    image: nginx`)
  })

  it('outdents over-indented comments to match siblings', () => {
    const broken = `services:
  nginx:
        # too deep
    image: nginx`
    const fixed = fixComposeYamlIndentation(broken)
    expect(fixed?.text).toBe(`services:
  nginx:
    # too deep
    image: nginx`)
  })

  it('leaves top-level comments before services alone', () => {
    const source = `# stack
services:
  nginx:
    image: nginx`
    expect(fixComposeYamlIndentation(source)).toBeNull()
  })

  it('returns null when indentation is already valid', () => {
    const source = `services:
  nginx:
    image: nginx`
    expect(fixComposeYamlIndentation(source)).toBeNull()
  })

  it('does not pull a second service under the first one', () => {
    const source = `services:
  nginx:
    image: nginx
  another:`
    expect(fixComposeYamlIndentation(source)).toBeNull()
  })

  it('does not pull a second fleshed-out service under the first one', () => {
    const source = `services:
  nginx:
    image: nginx
  another:
    image: redis`
    expect(fixComposeYamlIndentation(source)).toBeNull()
  })

  it('still deepens a genuinely under-indented service name', () => {
    const broken = `services:
  nginx:
    image: nginx
another:
  image: redis`
    const fixed = fixComposeYamlIndentation(broken)
    expect(fixed?.text).toBe(`services:
  nginx:
    image: nginx
  another:
    image: redis`)
  })

  it('does not pull a second service under a nested service networks list', () => {
    // Service-level `networks:` shares a name with the top-level section. The
    // nearest block-opener heuristic must treat indent 2 as having already
    // closed that nest — otherwise nginx2 is deepened under networks.
    const source = `services:
  nginx:
    image: nginx
    networks:
      - derp
      - ass
  nginx2:
    image: nginx
    networks:
      - derp`
    expect(fixComposeYamlIndentation(source)).toBeNull()
    expect(canFixComposeYamlIndentation(source)).toBe(false)
  })

  it('does not pull a later service property under nested volumes/networks maps', () => {
    const source = `services:
  web:
    image: nginx
    volumes:
      - data:/data
    environment:
      FOO: bar
    ports:
      - "80:80"`
    expect(fixComposeYamlIndentation(source)).toBeNull()
  })

  it('does not re-indent list items after a service networks mapping', () => {
    const source = `services:
  nginx:
    image: nginx
    networks:
      derp:
      ass:
  nginx2:
    image: nginx`
    expect(fixComposeYamlIndentation(source)).toBeNull()
  })
})

describe('yaml-indent helpers', () => {
  it('leadingWhitespace returns spaces and tabs only', () => {
    expect(leadingWhitespace('  \tkey: value')).toBe('  \t')
    expect(leadingWhitespace('key:')).toBe('')
  })

  it('parseYamlMappingKey ignores inline comments and reads mapping keys', () => {
    expect(parseYamlMappingKey('  services: # top')).toBe('services')
    expect(parseYamlMappingKey('  image: nginx')).toBe('image')
    expect(parseYamlMappingKey(': bad')).toBeNull()
    expect(parseYamlMappingKey('  # only comment')).toBeNull()
  })

  it('isFullLineComment detects indented comments', () => {
    expect(isFullLineComment('  # nested')).toBe(true)
    expect(isFullLineComment('image: nginx # inline')).toBe(false)
  })

  it('lineIndexAtOffset and mapOffsetThroughPerLineTrim track caret moves', () => {
    const text = 'services:  \n  nginx:\n'
    expect(lineIndexAtOffset(text, 0)).toBe(0)
    expect(lineIndexAtOffset(text, text.length)).toBe(2)
    const trimmed = trimTrailingWhitespacePerLine(text)
    expect(mapOffsetThroughPerLineTrim(text, trimmed, 11)).toBe(9)
    expect(mapOffsetThroughPerLineTrim(text, trimmed, text.length)).toBe(trimmed.length)
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

  it('inserts spaces at the caret when past leading whitespace', () => {
    const text = 'image: nginx'
    const result = applyTabIndent(text, { start: 6, end: 6 })
    expect(result.text).toBe('image:   nginx')
    expect(result.selection).toEqual({ start: 8, end: 8 })
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

  it('outdents tab- or single-space-indented lines and multi-line selections', () => {
    expect(applyTabOutdent('\tnginx:', { start: 2, end: 2 })).toEqual({
      text: 'nginx:',
      selection: { start: 1, end: 1 },
    })
    expect(applyTabOutdent(' nginx:', { start: 2, end: 2 })).toEqual({
      text: 'nginx:',
      selection: { start: 1, end: 1 },
    })
    const text = 'services:\n  nginx:\n  image: nginx\n'
    const result = applyTabOutdent(text, { start: 10, end: 28 })
    expect(result.text).toBe('services:\nnginx:\nimage: nginx\n')
  })

  it('canFixComposeYamlIndentation mirrors fixComposeYamlIndentation', () => {
    const broken = `services:
nginx:
  image: nginx`
    expect(canFixComposeYamlIndentation(broken)).toBe(true)
    expect(canFixComposeYamlIndentation('services:\n  nginx:\n    image: nginx')).toBe(
      false,
    )
  })

  it('outdents a line that has no indent prefix', () => {
    expect(applyTabOutdent('nginx:', { start: 2, end: 2 })).toEqual({
      text: 'nginx:',
      selection: { start: 2, end: 2 },
    })
  })

  it('expands a selection that ends on a newline without including the next line', () => {
    const text = 'nginx:\nimage: nginx\n'
    const result = applyTabIndent(text, { start: 0, end: 7 })
    expect(result.text).toBe('  nginx:\nimage: nginx\n')
  })
})

describe('expected indent helpers', () => {
  it('returns null for blank lines, comments, and top-level keys', () => {
    const lines = ['services:', '  nginx:', '    image: nginx', 'networks:']
    expect(expectedIndentForLine(lines, 0)).toBeNull()
    expect(expectedIndentForLine(['# comment'], 0)).toBeNull()
    expect(expectedIndentForLine([''], 0)).toBeNull()
    expect(expectedIndentForLine(lines, 3)).toBeNull()
    expect(expectedIndentForLine(lines, 99)).toBeNull()
  })

  it('aligns a shallow sibling service name with the previous service', () => {
    const lines = [
      'services:',
      '  nginx:',
      '    image: nginx',
      '   redis:',
    ]
    expect(expectedIndentForLine(lines, 3)).toBe(2)
  })

  it('leaves same-depth mapping keys alone when no shallower opener exists', () => {
    const lines = ['  foo:', '  bar:']
    expect(expectedIndentForLine(lines, 1)).toBeNull()
  })

  it('skips a colon-only opener when recovering a root-level service name', () => {
    const lines = ['services:', ':', 'nginx:']
    expect(expectedIndentForLine(lines, 2)).toBe(2)
  })

  it('nests a root-level service name under services', () => {
    const lines = ['services:', 'nginx:']
    expect(expectedIndentForLine(lines, 1)).toBe(2)
  })

  it('does not nest a second top-level key under services', () => {
    const lines = ['services:', '  nginx:', '    image: nginx', 'networks:']
    expect(expectedIndentForLine(lines, 3)).toBeNull()
  })

  it('returns null for comment indent when the line is not a comment', () => {
    expect(expectedIndentForCommentLine(['services:'], 0)).toBeNull()
    expect(expectedIndentForCommentLine(['services:'], 4)).toBeNull()
  })

  it('skips blank lines between a comment and the following content', () => {
    const lines = ['services:', '# web', '', '  nginx:']
    expect(expectedIndentForCommentLine(lines, 1)).toBe(2)
  })

  it('aligns a trailing comment with the previous sibling', () => {
    const lines = ['services:', '  nginx:', '    image: nginx', '# trailing']
    expect(expectedIndentForCommentLine(lines, 3)).toBe(4)
  })

  it('nests a trailing comment under the previous block opener', () => {
    const lines = ['services:', '# at end']
    expect(expectedIndentForCommentLine(lines, 1)).toBe(2)
  })

  it('leaves a root comment at column 0 when nothing surrounds it', () => {
    expect(expectedIndentForCommentLine(['# lone'], 0)).toBeNull()
  })

  it('infers service-property indent from the service name', () => {
    const lines = ['services:', '  nginx:', 'image: nginx']
    expect(expectedServicePropertyIndent(lines, 2)).toBe(4)
  })

  it('returns null for a property sitting directly under services', () => {
    expect(expectedServicePropertyIndent(['services:', 'image: nginx'], 1)).toBeNull()
  })

  it('returns null once a later top-level section has started', () => {
    const lines = [
      'services:',
      '  nginx:',
      '    image: nginx',
      'networks:',
      'image: nginx',
    ]
    expect(expectedServicePropertyIndent(lines, 4)).toBeNull()
  })

  it('fixUnderIndentedServiceKeyLine deepens a shallow restart key', () => {
    const text = `services:
  nginx:
    image: nginx
restart: always`
    const fixed = fixUnderIndentedServiceKeyLine(text, 3)
    expect(fixed?.text).toContain('    restart: always')
    expect(fixed?.indentDelta).toBe(4)
  })

  it('fixUnderIndentedServiceKeyLine is a no-op for missing or already-deep keys', () => {
    expect(fixUnderIndentedServiceKeyLine('services:\n', 9)).toBeNull()
    expect(fixUnderIndentedServiceKeyLine('services:\n  nginx:', 1)).toBeNull()
    const already = `services:
  nginx:
    image: nginx`
    expect(fixUnderIndentedServiceKeyLine(already, 2)).toBeNull()
  })
})

describe('caret mapping and newline insertion', () => {
  it('mapOffsetThroughPerLineTrim is a no-op when nothing trims', () => {
    const text = 'services:\n  nginx:'
    expect(mapOffsetThroughPerLineTrim(text, text, 4)).toBe(4)
    expect(mapOffsetThroughPerLineTrim(text, text, -1)).toBe(0)
    expect(mapOffsetThroughPerLineTrim(text, text, 99)).toBe(text.length)
  })

  it('inserts a newline in the middle of a line and indents the continuation', () => {
    const prev = 'services:\n  nginx:'
    const next = 'services:\n  ng\ninx:'
    const result = applyNewlineAutoIndent(prev, next)
    expect(result?.text).toBe('services:\n  ng\n  inx:')
  })

  it('preserves a selection through an indent rewrite', () => {
    const broken = `services:
nginx:
  image: nginx`
    const caret = broken.indexOf('nginx:')
    const fixed = fixComposeYamlIndentation(broken, { start: caret, end: caret })
    expect(fixed?.text.startsWith('services:\n  nginx:')).toBe(true)
    expect(fixed?.selection.start).toBeGreaterThanOrEqual(caret)
  })

  it('maps a multi-line selection through an indent rewrite', () => {
    const broken = `services:
nginx:
  image: nginx`
    const start = broken.indexOf('nginx:')
    const end = broken.length
    const fixed = fixComposeYamlIndentation(broken, { start, end })
    expect(fixed?.selection.end).toBeGreaterThan(fixed?.selection.start ?? 0)
  })

  it('returns null when a comment is already at the expected indent', () => {
    const lines = ['services:', '  # web', '  nginx:']
    expect(expectedIndentForCommentLine(lines, 1)).toBeNull()
  })

  it('parseYamlMappingKey returns null without a colon', () => {
    expect(parseYamlMappingKey('nginx')).toBeNull()
    expect(parseYamlMappingKey('  ')).toBeNull()
  })

  it('does not rewrite a service property that is already nested', () => {
    const lines = ['services:', '  nginx:', '    image: nginx']
    expect(expectedIndentForLine(lines, 2)).toBeNull()
  })
})

describe('sibling top-level key recovery', () => {
  it('leaves a root-level name/version pair at column 0', () => {
    const lines = ['name: demo', 'version: "3.9"', 'services:']
    expect(expectedIndentForLine(lines, 1)).toBeNull()
    expect(expectedIndentForLine(lines, 2)).toBeNull()
  })

  it('does not nest a later top-level section under services', () => {
    const lines = ['services:', '  nginx:', '    image: nginx', 'volumes:', 'secrets:']
    expect(expectedIndentForLine(lines, 3)).toBeNull()
    expect(expectedIndentForLine(lines, 4)).toBeNull()
  })

  it('deepens a one-space-indented name key under the preceding section', () => {
    // `name` is top-level-only; indent 1 is still a child of `services:` for
    // the opener walk (parent indent 0 < 1 < 2).
    const lines = ['services:', ' name:']
    expect(expectedIndentForLine(lines, 1)).toBe(2)
  })

  it('skips a column-0 user-defined name when recovering a later sibling section', () => {
    const lines = ['services:', 'nginx:', 'networks:']
    expect(expectedIndentForLine(lines, 2)).toBeNull()
  })
})

describe('user-defined name keys', () => {
  it('aligns a name one space deeper than the previous service name', () => {
    const lines = ['services:', '  nginx:', '   redis:']
    expect(expectedIndentForLine(lines, 2)).toBe(2)
  })

  it('does not outdent that one-space-deeper sibling when rewriting', () => {
    const source = `services:
  nginx:
    image: nginx
   redis:`
    expect(fixComposeYamlIndentation(source)).toBeNull()
    expect(canFixComposeYamlIndentation(source)).toBe(false)
  })

  it('aligns a column-0 name with a preceding indented service sibling', () => {
    const lines = ['services:', '  nginx:', '    image: nginx', 'redis:']
    expect(expectedIndentForLine(lines, 3)).toBe(2)
  })

  it('leaves a root-level user-defined name alone when no section is open', () => {
    expect(expectedIndentForLine(['nginx:'], 0)).toBeNull()
    expect(expectedIndentForLine(['# stack', 'nginx:'], 1)).toBeNull()
    expect(expectedIndentForLine([':', 'custom:'], 1)).toBeNull()
  })

  it('leaves a root name alone after an indented top-level opener', () => {
    const lines = ['  services:', 'custom:']
    expect(expectedIndentForLine(lines, 1)).toBeNull()
  })

  it('nests a root name under services even when a column-0 name sits between', () => {
    const lines = ['services:', 'nginx:', 'redis:']
    expect(expectedIndentForLine(lines, 2)).toBe(2)
  })
})

describe('comment indent edges', () => {
  it('skips following comments when matching the next content line', () => {
    const lines = ['services:', '# first', '# second', '  nginx:']
    expect(expectedIndentForCommentLine(lines, 1)).toBe(2)
  })

  it('skips blank and comment lines when walking backward', () => {
    const lines = ['services:', '  nginx:', '', '# note', '# trailing']
    expect(expectedIndentForCommentLine(lines, 4)).toBe(4)
  })

  it('leaves a trailing comment that already matches the previous sibling', () => {
    const lines = ['    image: nginx', '    # done']
    expect(expectedIndentForCommentLine(lines, 1)).toBeNull()
  })

  it('leaves a trailing comment that already nests under the previous opener', () => {
    const lines = ['services:', '  # already nested']
    expect(expectedIndentForCommentLine(lines, 1)).toBeNull()
  })

  it('outdents an orphan indented comment to column 0', () => {
    expect(expectedIndentForCommentLine(['    # orphan'], 0)).toBe(0)
    const fixed = fixComposeYamlIndentation('    # orphan')
    if (fixed === null) {
      throw new TypeError('expected orphan comment to snap to column 0')
    }
    expect(fixed.text).toBe('# orphan')
  })

  it('nests a trailing comment after blanks under the previous opener', () => {
    const lines = ['services:', '', '', '# end']
    expect(expectedIndentForCommentLine(lines, 3)).toBe(2)
  })
})

describe('rewrite and caret mapping leftovers', () => {
  it('maps a caret on a later line through an earlier indent rewrite', () => {
    const broken = `services:
nginx:
  image: nginx`
    const caret = broken.indexOf('image')
    const fixed = fixComposeYamlIndentation(broken, { start: caret, end: caret })
    if (fixed === null) {
      throw new TypeError('expected indent rewrite')
    }
    expect(fixed.text.indexOf('image')).toBe(fixed.selection.start)
  })

  it('keeps a caret in leading whitespace on the content when indent grows', () => {
    const broken = `services:
nginx:`
    const caret = broken.indexOf('nginx:')
    const fixed = fixComposeYamlIndentation(broken, { start: caret, end: caret })
    if (fixed === null) {
      throw new TypeError('expected indent rewrite')
    }
    expect(fixed.text).toBe('services:\n  nginx:')
    expect(fixed.selection).toEqual({ start: caret + 2, end: caret + 2 })
  })

  it('maps a selection sitting in an over-indented comment that snaps left', () => {
    const broken = `services:
  nginx:
        # too deep
    image: nginx`
    const commentAt = broken.indexOf('# too deep')
    const fixed = fixComposeYamlIndentation(broken, {
      start: commentAt - 2,
      end: commentAt,
    })
    if (fixed === null) {
      throw new TypeError('expected comment outdent')
    }
    expect(fixed.text).toBe(`services:
  nginx:
    # too deep
    image: nginx`)
    // Caret in leading whitespace does not apply a negative indent delta, so
    // the selection columns stay put while the comment text moves left.
    expect(fixed.selection).toEqual({ start: commentAt - 2, end: commentAt })
  })

  it('mapOffsetThroughPerLineTrim clamps a past-the-end offset on mismatched lines', () => {
    expect(mapOffsetThroughPerLineTrim('hello', 'hi', 5)).toBe(2)
    expect(mapOffsetThroughPerLineTrim('a\nb\n', 'a\nb', 4)).toBe(4)
    expect(mapOffsetThroughPerLineTrim('a', '', 1)).toBe(0)
  })
})

describe('newline auto-indent leftovers', () => {
  it('returns null when the edit is not exactly one inserted character', () => {
    expect(applyNewlineAutoIndent('services:', 'services:\n  ')).toBeNull()
    expect(applyNewlineAutoIndent('abc', 'ab')).toBeNull()
    expect(applyNewlineAutoIndent('abc', 'abc')).toBeNull()
  })

  it('returns null when a newline is inserted but the remainder does not match', () => {
    expect(applyNewlineAutoIndent('abc', 'a\nxc')).toBeNull()
  })

  it('returns null when the inserted newline is at the start of the document', () => {
    expect(applyNewlineAutoIndent('services:', '\nservices:')).toBeNull()
    expect(applyNewlineAutoIndent('', '\n')).toBeNull()
  })

  it('indents after a newline inserted in the middle of a completed key line', () => {
    const prev = 'services:\n  nginx: always'
    const next = 'services:\n  nginx:\n always'
    const result = applyNewlineAutoIndent(prev, next)
    if (result === null) {
      throw new TypeError('expected newline auto-indent')
    }
    expect(result.text).toBe('services:\n  nginx:\n     always')
  })
})
