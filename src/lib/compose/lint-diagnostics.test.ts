import { describe, expect, it } from 'vitest'
import { composeLintIssuesToDiagnostics } from './lint-diagnostics'
import type { ComposeLintIssue } from './lint'

/** Character offset of the start of the given 1-based line in `text`. */
function lineStart(text: string, line: number): number {
  const lines = text.split('\n')
  let offset = 0
  for (let index = 0; index < line - 1; index += 1) {
    offset += (lines[index]?.length ?? 0) + 1
  }
  return offset
}

describe('composeLintIssuesToDiagnostics', () => {
  it('maps a 1-based line issue to its character range', () => {
    const text = 'services:\n  nginx:\n    imaage: nginx'
    const issues: ComposeLintIssue[] = [
      {
        level: 'warning',
        message: 'Unknown service key "imaage" — did you mean "image"?',
        path: 'services.nginx.imaage',
        line: 3,
      },
    ]

    const from = lineStart(text, 3)
    const lineThreeText = text.split('\n')[2] ?? ''

    expect(composeLintIssuesToDiagnostics(text, issues)).toEqual([
      {
        from,
        to: from + lineThreeText.length,
        severity: 'warning',
        message: 'Unknown service key "imaage" — did you mean "image"?',
      },
    ])
  })

  it('resolves multiple issues on different lines independently', () => {
    const text = 'a\nbb\nccc'
    const issues: ComposeLintIssue[] = [
      { level: 'error', message: 'first', path: '$', line: 1 },
      { level: 'warning', message: 'third', path: '$', line: 3 },
    ]

    expect(composeLintIssuesToDiagnostics(text, issues)).toEqual([
      { from: 0, to: 1, severity: 'error', message: 'first' },
      { from: 5, to: 8, severity: 'warning', message: 'third' },
    ])
  })

  it('drops issues with no resolvable line', () => {
    const text = 'services:\n  nginx:\n    image: nginx'
    const issues: ComposeLintIssue[] = [
      { level: 'warning', message: 'no line', path: '$' },
      { level: 'error', message: 'out of range', path: '$', line: 99 },
    ]

    expect(composeLintIssuesToDiagnostics(text, issues)).toEqual([])
  })

  it('returns an empty list for no issues', () => {
    expect(composeLintIssuesToDiagnostics('services:\n  nginx:\n', [])).toEqual([])
  })
})
