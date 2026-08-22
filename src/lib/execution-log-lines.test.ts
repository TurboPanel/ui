import { describe, expect, it } from 'vitest'
import {
  groupTranscriptByPhase,
  mergeTranscriptLines,
  parseCommandLogChunk,
  plainTextTranscriptLines,
  stripAnsi,
  transcriptPlainText,
  type LogTranscriptLine,
} from './execution-log-lines'

function event(
  sequence: number,
  message: string,
  extra?: Partial<{ stream: string; phase: string; timestamp: string }>,
): string {
  return `${JSON.stringify({
    commandId: 'cmd-1',
    sequence,
    timestamp: extra?.timestamp ?? '2026-08-21T12:00:00.000Z',
    stream: extra?.stream ?? 'stdout',
    phase: extra?.phase ?? 'build',
    message,
  })}\n`
}

describe('stripAnsi', () => {
  it('removes SGR colour codes and carriage returns', () => {
    expect(stripAnsi('\u001B[32mok\u001B[0m\r')).toBe('ok')
  })

  it('leaves plain text untouched', () => {
    expect(stripAnsi('docker compose up -d')).toBe('docker compose up -d')
  })
})

describe('parseCommandLogChunk', () => {
  it('parses NDJSON events into transcript rows', () => {
    const rows = parseCommandLogChunk(
      event(1, 'step 1') + event(2, 'boom', { stream: 'stderr', phase: 'pull' }),
    )
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ seq: 1, stream: 'stdout', phase: 'build' })
    expect(rows[1]).toMatchObject({ seq: 2, stream: 'stderr', phase: 'pull' })
  })

  it('strips ANSI from event messages', () => {
    const rows = parseCommandLogChunk(event(1, '\u001B[31mfailed\u001B[0m'))
    expect(rows[0]?.message).toBe('failed')
  })

  it('falls back to a stdout row for plain text (truncation marker)', () => {
    const rows = parseCommandLogChunk(
      '[turbopanel] execution log truncated\n',
      40,
    )
    expect(rows).toEqual([
      {
        seq: 41,
        timestamp: null,
        stream: 'stdout',
        phase: null,
        message: '[turbopanel] execution log truncated',
      },
    ])
  })

  it('drops a trailing fragment with no newline', () => {
    const rows = parseCommandLogChunk(`${event(1, 'complete')}{"sequence":2`)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.seq).toBe(1)
  })

  it('returns nothing for an empty chunk', () => {
    expect(parseCommandLogChunk('')).toEqual([])
  })

  it('ignores malformed JSON objects that are not events', () => {
    const rows = parseCommandLogChunk('{"nope":true}\n', 7)
    expect(rows[0]).toMatchObject({ seq: 8, message: '{"nope":true}' })
  })
})

describe('mergeTranscriptLines', () => {
  const line = (seq: number, message: string): LogTranscriptLine => ({
    seq,
    timestamp: null,
    stream: 'stdout',
    phase: null,
    message,
  })

  it('appends new rows in sequence order', () => {
    const merged = mergeTranscriptLines(
      [line(1, 'a'), line(2, 'b')],
      [line(3, 'c')],
    )
    expect(merged.map((row) => row.message)).toEqual(['a', 'b', 'c'])
  })

  it('collapses a replayed chunk instead of duplicating it', () => {
    const merged = mergeTranscriptLines(
      [line(1, 'a'), line(2, 'b')],
      [line(2, 'b'), line(3, 'c')],
    )
    expect(merged).toHaveLength(3)
  })

  it('keeps stdout and stderr rows with the same sequence apart', () => {
    const merged = mergeTranscriptLines(
      [line(1, 'out')],
      [{ ...line(1, 'err'), stream: 'stderr' }],
    )
    expect(merged).toHaveLength(2)
  })

  it('returns a copy when nothing arrives', () => {
    const current = [line(1, 'a')]
    const merged = mergeTranscriptLines(current, [])
    expect(merged).toEqual(current)
    expect(merged).not.toBe(current)
  })
})

describe('plainTextTranscriptLines', () => {
  it('turns an engine log tail into stdout rows and drops blank lines', () => {
    const rows = plainTextTranscriptLines('one\n\n  \ntwo\n')
    expect(rows.map((row) => row.message)).toEqual(['one', 'two'])
    expect(rows.every((row) => row.stream === 'stdout')).toBe(true)
    expect(rows.every((row) => row.phase === null)).toBe(true)
  })
})

describe('transcriptPlainText', () => {
  it('marks stderr rows so a copied transcript keeps the distinction', () => {
    const text = transcriptPlainText([
      { seq: 1, timestamp: null, stream: 'stdout', phase: null, message: 'ok' },
      { seq: 2, timestamp: null, stream: 'stderr', phase: null, message: 'bad' },
    ])
    expect(text).toBe('ok\nstderr bad')
  })
})

describe('groupTranscriptByPhase', () => {
  it('groups consecutive rows and starts a new group on phase change', () => {
    const rows = parseCommandLogChunk(
      event(1, 'a', { phase: 'build' }) +
        event(2, 'b', { phase: 'build' }) +
        event(3, 'c', { phase: 'compose-up' }),
    )
    const groups = groupTranscriptByPhase(rows)
    expect(groups.map((group) => group.phase)).toEqual(['build', 'compose-up'])
    expect(groups[0]?.lines).toHaveLength(2)
  })

  it('re-opens a phase group when the phase comes back', () => {
    const rows = parseCommandLogChunk(
      event(1, 'a', { phase: 'build' }) +
        event(2, 'b', { phase: 'health' }) +
        event(3, 'c', { phase: 'build' }),
    )
    expect(groupTranscriptByPhase(rows)).toHaveLength(3)
  })
})
