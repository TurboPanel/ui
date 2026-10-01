import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Customers buy and release licenses and add servers. "Seat" survives only as
 * an identifier (the `/billing/seats` route, the `release-seat` change kind,
 * `${seats}` interpolations), never in the words the app shows.
 */
const SRC = join(__dirname, '..')
const SEAT_WORD = /\bseats?\b/i
const STRING_LITERAL = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\\n]|\\.)*`/g

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(full)
    const isSource = /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
    return isSource ? [full] : []
  })
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trimStart()
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')
}

/** The words inside quotes, with interpolations and route / kind identifiers removed. */
export function visibleStrings(line: string): string[] {
  if (isCommentLine(line)) return []
  return (line.match(STRING_LITERAL) ?? []).map((literal) =>
    literal
      .replaceAll(/\$\{[^}]*\}/g, '')
      .replaceAll('/billing/seats', '')
      .replaceAll('release-seat', '')
  )
}

function offenders(): string[] {
  return sourceFiles(SRC).flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((text, index) =>
        visibleStrings(text).some((s) => SEAT_WORD.test(s))
          ? [`${relative(SRC, file)}:${index + 1}: ${text.trim()}`]
          : []
      )
  )
}

describe('billing vocabulary', () => {
  it('no string the app can show says "seat"', () => {
    expect(offenders()).toEqual([])
  })

  it('the scan reads strings, not comments, identifiers or interpolations', () => {
    expect(
      visibleStrings("hint: 'Subscription, seats per tier'").some((s) => SEAT_WORD.test(s))
    ).toBe(true)
    expect(visibleStrings("const kind = 'release-seat'").some((s) => SEAT_WORD.test(s))).toBe(false)
    expect(visibleStrings('// buy a seat')).toHaveLength(0)
    expect(visibleStrings('`bought by ${seats} orgs`').some((s) => SEAT_WORD.test(s))).toBe(false)
  })
})
