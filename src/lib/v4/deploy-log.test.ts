import { describe, expect, it } from 'vitest'
import type { LogTranscriptLine } from '@/lib/execution-log-lines'
import {
  emptyLogNote,
  firstErrorIndex,
  isFiltering,
  isLiveLog,
  lineCount,
  lineTime,
  logItems,
  logPlainText,
  NO_FILTER,
  phaseChips,
  phaseLabel,
} from './deploy-log'

function line(seq: number, message: string, extra: Partial<LogTranscriptLine> = {}): LogTranscriptLine {
  return { seq, timestamp: null, stream: 'stdout', phase: null, message, ...extra }
}

const LINES: LogTranscriptLine[] = [
  line(1, 'Cloning repository', { phase: 'fetch' }),
  line(2, 'Step 1/4 : FROM node:22', { phase: 'build' }),
  line(3, 'npm ERR! missing script: build', { phase: 'build', stream: 'stderr' }),
  line(4, 'Container web Started', { phase: 'compose-up', stream: 'stderr' }),
  line(5, 'done'),
]

describe('phaseLabel', () => {
  it('uses plain words for known phases and shows an unknown one as sent', () => {
    expect(phaseLabel('compose-up')).toBe('Compose up')
    expect(phaseLabel('build')).toBe('Build')
    expect(phaseLabel('mystery')).toBe('mystery')
  })
})

describe('lineTime', () => {
  it('reads the local time of a line, and nothing for no or a bad stamp', () => {
    const stamp = '2026-10-05T12:04:37.000Z'
    const d = new Date(stamp)
    const expected = [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':')
    expect(lineTime(stamp)).toBe(expected)
    expect(lineTime(null)).toBeNull()
    expect(lineTime('later')).toBeNull()
  })
})

describe('phaseChips', () => {
  it('lists the phases in the order reached, with their line counts', () => {
    expect(phaseChips(LINES)).toEqual([
      { phase: 'fetch', label: 'Fetch source', lines: 1 },
      { phase: 'build', label: 'Build', lines: 2 },
      { phase: 'compose-up', label: 'Compose up', lines: 1 },
    ])
    expect(phaseChips([line(1, 'x')])).toEqual([])
  })
})

describe('logItems', () => {
  it('puts a heading before each run of lines in a phase, and none for lines without one', () => {
    const items = logItems(LINES)
    expect(items.map((item) => (item.kind === 'phase' ? `# ${item.label}` : item.message))).toEqual([
      '# Fetch source',
      'Cloning repository',
      '# Build',
      'Step 1/4 : FROM node:22',
      'npm ERR! missing script: build',
      '# Compose up',
      'Container web Started',
      'done',
    ])
  })

  it('marks an error line, and not a benign line the engine printed to stderr', () => {
    const errors = logItems(LINES).flatMap((item) => (item.kind === 'line' && item.isError ? [item.message] : []))
    expect(errors).toEqual(['npm ERR! missing script: build'])
  })

  it('narrows to one phase', () => {
    const items = logItems(LINES, { query: '', phase: 'build' })
    expect(lineCount(items)).toBe(2)
    expect(items.filter((item) => item.kind === 'phase')).toHaveLength(1)
  })

  it('searches without regard to case, ignoring blanks around the text', () => {
    expect(lineCount(logItems(LINES, { query: '  NPM err ', phase: null }))).toBe(1)
    expect(lineCount(logItems(LINES, { query: 'nothing like this', phase: null }))).toBe(0)
  })

  it('collapses a repeated progress tick but keeps repeated output', () => {
    const tick = (seq: number) => line(seq, 'Container web Starting', { stream: 'stderr', phase: 'compose-up' })
    expect(lineCount(logItems([tick(1), tick(2), tick(3)]))).toBe(1)
    const same = (seq: number) => line(seq, 'listening')
    expect(lineCount(logItems([same(1), same(2)]))).toBe(2)
  })

  it('carries the time of a line that has one', () => {
    const [item] = logItems([line(1, 'x', { timestamp: '2026-10-05T12:04:37.000Z' })])
    expect(item).toMatchObject({ kind: 'line', time: lineTime('2026-10-05T12:04:37.000Z') })
  })
})

describe('firstErrorIndex', () => {
  it('points at the first error row, headings counted, or -1', () => {
    const items = logItems(LINES)
    expect(firstErrorIndex(items)).toBe(4)
    expect(firstErrorIndex(logItems([line(1, 'fine')]))).toBe(-1)
    expect(firstErrorIndex([])).toBe(-1)
  })
})

describe('filters and plain text', () => {
  it('knows when a filter is on', () => {
    expect(isFiltering(NO_FILTER)).toBe(false)
    expect(isFiltering({ query: '   ', phase: null })).toBe(false)
    expect(isFiltering({ query: 'x', phase: null })).toBe(true)
    expect(isFiltering({ query: '', phase: 'build' })).toBe(true)
  })

  it('copies every line with errors marked', () => {
    expect(logPlainText(LINES)).toBe(
      'Cloning repository\nStep 1/4 : FROM node:22\nstderr npm ERR! missing script: build\nContainer web Started\ndone',
    )
  })
})

describe('emptyLogNote and isLiveLog', () => {
  it('says what to expect in each state with no lines', () => {
    expect(emptyLogNote('waiting').title).toBe('Waiting for output')
    expect(emptyLogNote('forbidden').title).toBe('You cannot read this log')
    expect(emptyLogNote('unavailable').title).toBe('No log was kept')
    expect(emptyLogNote('idle').title).toBe('No output yet')
  })

  it('is live while waiting or streaming', () => {
    expect(isLiveLog('waiting')).toBe(true)
    expect(isLiveLog('streaming')).toBe(true)
    expect(isLiveLog('sealed')).toBe(false)
    expect(isLiveLog('truncated')).toBe(false)
  })
})
