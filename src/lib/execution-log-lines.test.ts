import { describe, expect, it } from 'vitest'
import {
  collapseRepeatedProgressLines,
  groupTranscriptByPhase,
  isDockerProgressLine,
  isErrorLine,
  normalizeTranscriptMessage,
  mergeTranscriptLines,
  parseCommandLogChunk,
  plainTextTranscriptLines,
  stripAnsi,
  transcriptLineKey,
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

  it('falls back to stdout when NDJSON rows lack required event fields', () => {
    expect(parseCommandLogChunk('{"sequence":1}\n', 0)).toEqual([
      {
        seq: 1,
        timestamp: null,
        stream: 'stdout',
        phase: null,
        message: '{"sequence":1}',
      },
    ])
    expect(parseCommandLogChunk('{"message":"ok"}\n', 0)).toEqual([
      {
        seq: 1,
        timestamp: null,
        stream: 'stdout',
        phase: null,
        message: '{"message":"ok"}',
      },
    ])
  })

  it('normalizes blank phase and timestamp to null', () => {
    const rows = parseCommandLogChunk(
      `${JSON.stringify({
        commandId: 'cmd-1',
        sequence: 1,
        timestamp: '   ',
        stream: 'stdout',
        phase: '',
        message: 'ready',
      })}\n`,
    )
    expect(rows[0]).toMatchObject({
      seq: 1,
      timestamp: null,
      phase: null,
      message: 'ready',
    })
  })

  it('skips blank plain-text lines inside a chunk', () => {
    expect(parseCommandLogChunk('   \nstill here\n')).toEqual([
      {
        seq: 1,
        timestamp: null,
        stream: 'stdout',
        phase: null,
        message: 'still here',
      },
    ])
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

  it('replaces a replayed row when the same key arrives again', () => {
    const merged = mergeTranscriptLines(
      [line(1, 'old')],
      [{ ...line(1, 'new'), stream: 'stdout' }],
    )
    expect(merged).toEqual([line(1, 'new')])
  })
})

describe('transcriptLineKey', () => {
  it('combines sequence and stream', () => {
    const row: LogTranscriptLine = {
      seq: 3,
      timestamp: null,
      stream: 'stdout',
      phase: null,
      message: 'x',
    }
    expect(transcriptLineKey(row)).toBe('3:stdout')
    expect(transcriptLineKey({ ...row, stream: 'stderr' })).toBe('3:stderr')
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

describe('docker progress lines', () => {
  it('recognises progress lines with one trailing status word', () => {
    expect(isDockerProgressLine(' 6d2dcf61e6fc Downloading layer')).toBe(true)
  })

  it.each([
    ' Image adminer:latest Pulling ',
    ' 6d2dcf61e6fc Pulling fs layer 0B',
    ' 44dd5065ed48 Downloading 2.097MB',
    ' 4f4fb700ef54 Already exists 0B',
    ' 30d32a3eb4a4 Extracting 1B',
    ' Container adminer Started ',
    ' Network proj_default Created ',
  ])('recognises %s as progress', (message) => {
    expect(isDockerProgressLine(message)).toBe(true)
  })

  it.each([
    'Error response from daemon: pull access denied',
    'ERROR: for adminer  Cannot start service',
    'WARN[0000] a docker-compose.yml file was found',
    ' Container adminer Error ',
    'failed to solve: process did not complete successfully',
  ])('does not swallow %s', (message) => {
    expect(isDockerProgressLine(message)).toBe(false)
  })

  it('flags only non-progress stderr as an error', () => {
    const progress: LogTranscriptLine = {
      seq: 1,
      timestamp: null,
      stream: 'stderr',
      phase: 'compose-up',
      message: ' 6d2dcf61e6fc Pull complete',
    }
    expect(isErrorLine(progress)).toBe(false)
    expect(isErrorLine({ ...progress, seq: 2, message: 'boom' })).toBe(true)
    expect(isErrorLine({ ...progress, seq: 3, stream: 'stdout' })).toBe(false)
  })
})

describe('normalizeTranscriptMessage', () => {
  it.each([
    [' 6d2dcf61e6fc Pulling fs layer 0B', ' 6d2dcf61e6fc Pulling fs layer'],
    [' 30d32a3eb4a4 Extracting 1B', ' 30d32a3eb4a4 Extracting'],
    [' Image adminer:latest Pulling ', ' Image adminer:latest Pulling'],
  ])('drops the empty byte counter from %s', (input, expected) => {
    expect(normalizeTranscriptMessage(input)).toBe(expected)
  })

  it('keeps a real size', () => {
    expect(normalizeTranscriptMessage(' 44dd5065ed48 Downloading 2.097MB')).toBe(
      ' 44dd5065ed48 Downloading 2.097MB',
    )
  })

  it('leaves non-progress text alone', () => {
    expect(normalizeTranscriptMessage('wrote 1B to disk')).toBe('wrote 1B to disk')
  })
})

describe('collapseRepeatedProgressLines', () => {
  it('collapses consecutive identical progress rows', () => {
    const rows = parseCommandLogChunk(
      event(1, ' 30d32a3eb4a4 Extracting 1B', { stream: 'stderr' }) +
        event(2, ' 30d32a3eb4a4 Extracting 1B', { stream: 'stderr' }) +
        event(3, ' 30d32a3eb4a4 Extracting 1B', { stream: 'stderr' }) +
        event(4, ' 30d32a3eb4a4 Pull complete 0B', { stream: 'stderr' }),
    )
    expect(collapseRepeatedProgressLines(rows).map((row) => row.seq)).toEqual([
      1, 4,
    ])
  })

  it('keeps repeated non-progress output', () => {
    const rows = parseCommandLogChunk(
      event(1, 'retrying') + event(2, 'retrying'),
    )
    expect(collapseRepeatedProgressLines(rows)).toHaveLength(2)
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

  it('groups null-phase rows together', () => {
    const rows = parseCommandLogChunk(
      `${JSON.stringify({
        commandId: 'cmd-1',
        sequence: 1,
        timestamp: '2026-08-21T12:00:00.000Z',
        stream: 'stdout',
        message: 'a',
      })}\n${JSON.stringify({
        commandId: 'cmd-1',
        sequence: 2,
        timestamp: '2026-08-21T12:00:00.000Z',
        stream: 'stdout',
        message: 'b',
      })}\n`,
    )
    const groups = groupTranscriptByPhase(rows)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.phase).toBeNull()
    expect(groups[0]?.lines).toHaveLength(2)
  })
})
