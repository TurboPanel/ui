import { describe, expect, it } from 'vitest'
import { indexOfYamlComment, splitYamlLineHighlight } from './yaml-highlight'

describe('indexOfYamlComment', () => {
  it('finds a bare comment', () => {
    expect(indexOfYamlComment('  # hello')).toBe(2)
  })

  it('finds an inline comment', () => {
    expect(indexOfYamlComment('    image: nginx # web')).toBe(17)
  })

  it('ignores # inside double quotes', () => {
    expect(indexOfYamlComment('    image: "nginx#latest"')).toBe(-1)
  })

  it('ignores # inside single quotes', () => {
    expect(indexOfYamlComment("    image: 'nginx#latest'")).toBe(-1)
  })
})

describe('splitYamlLineHighlight', () => {
  it('marks a full comment line including indent', () => {
    expect(splitYamlLineHighlight('  # note')).toEqual([
      { text: '  # note', kind: 'comment' },
    ])
  })

  it('splits an inline comment', () => {
    expect(splitYamlLineHighlight('    image: nginx # web')).toEqual([
      { text: '    image: nginx ', kind: 'code' },
      { text: '# web', kind: 'comment' },
    ])
  })

  it('leaves code-only lines alone', () => {
    expect(splitYamlLineHighlight('  nginx:')).toEqual([
      { text: '  nginx:', kind: 'code' },
    ])
  })

  it('does not treat quoted hashes as comments', () => {
    expect(splitYamlLineHighlight('    image: "nginx#latest"')).toEqual([
      { text: '    image: "nginx#latest"', kind: 'code' },
    ])
  })

  it('treats an empty line as code', () => {
    expect(splitYamlLineHighlight('')).toEqual([{ text: '', kind: 'code' }])
  })

  it('styles a hash that starts the line as a full-line comment', () => {
    expect(splitYamlLineHighlight('#')).toEqual([{ text: '#', kind: 'comment' }])
  })
})
