/**
 * What the Log screen shows from a deploy's transcript: the rows, the phase
 * chips, the search and where the first error is.
 *
 * Everything comes from the transcript the daemon sent. A phase is a phase
 * only if a line says so; nothing is added around it.
 */

import {
  collapseRepeatedProgressLines,
  isErrorLine,
  type LogTranscriptLine,
} from '@/lib/execution-log-lines'
import type { CommandLogState } from '@/lib/queries/execution-logs'

const PHASE_LABELS: Readonly<Record<string, string>> = {
  prepare: 'Prepare',
  pull: 'Pull',
  fetch: 'Fetch source',
  build: 'Build',
  'release-promote': 'Promote release',
  'pre-deploy': 'Pre-deploy hooks',
  'compose-up': 'Compose up',
  health: 'Health check',
  'post-deploy': 'Post-deploy hooks',
  hooks: 'Hooks',
  'managed-apply': 'Managed apply',
  'lifecycle-start': 'Start',
  'lifecycle-stop': 'Stop',
  'lifecycle-restart': 'Restart',
  stop: 'Stop',
}

/** The words for a daemon phase; an unknown phase shows as it was sent. */
export function phaseLabel(phase: string): string {
  return PHASE_LABELS[phase] ?? phase
}

/** `12:04:37` for a line's time, or null when it has none. Read while watching, not audited by date. */
export function lineTime(timestamp: string | null): string | null {
  if (timestamp === null) return null
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) return null
  const two = (value: number) => String(value).padStart(2, '0')
  return `${two(parsed.getHours())}:${two(parsed.getMinutes())}:${two(parsed.getSeconds())}`
}

export type PhaseChip = Readonly<{ phase: string; label: string; lines: number }>

/** The phases in the order the transcript first reached them, with how many lines each has. */
export function phaseChips(lines: readonly LogTranscriptLine[]): PhaseChip[] {
  const counts = new Map<string, number>()
  for (const line of lines) {
    if (line.phase !== null) counts.set(line.phase, (counts.get(line.phase) ?? 0) + 1)
  }
  return [...counts].map(([phase, count]) => ({ phase, label: phaseLabel(phase), lines: count }))
}

export type LogFilter = Readonly<{
  /** Case-insensitive text a line must contain; blank means every line. */
  query: string
  /** Only this phase; null means all of them. */
  phase: string | null
}>

export const NO_FILTER: LogFilter = { query: '', phase: null }

export function isFiltering(filter: LogFilter): boolean {
  return filter.query.trim() !== '' || filter.phase !== null
}

export type LogItem =
  | Readonly<{ kind: 'phase'; key: string; label: string }>
  | Readonly<{ kind: 'line'; key: string; time: string | null; message: string; isError: boolean }>

/**
 * The rows to draw: repeated progress ticks collapsed, the filter applied, and
 * a heading before each run of lines that share a phase.
 */
export function logItems(lines: readonly LogTranscriptLine[], filter: LogFilter = NO_FILTER): LogItem[] {
  const needle = filter.query.trim().toLowerCase()
  const items: LogItem[] = []
  let current: string | null | undefined
  for (const line of collapseRepeatedProgressLines(lines)) {
    if (filter.phase !== null && line.phase !== filter.phase) continue
    if (needle !== '' && !line.message.toLowerCase().includes(needle)) continue
    if (line.phase !== current) {
      current = line.phase
      if (line.phase !== null) {
        items.push({ kind: 'phase', key: `phase:${line.phase}:${line.seq}`, label: phaseLabel(line.phase) })
      }
    }
    items.push({
      kind: 'line',
      key: `${line.seq}:${line.stream}`,
      time: lineTime(line.timestamp),
      message: line.message,
      isError: isErrorLine(line),
    })
  }
  return items
}

/** Index in `items` of the first error line, or -1 when there is none. */
export function firstErrorIndex(items: readonly LogItem[]): number {
  return items.findIndex((item) => item.kind === 'line' && item.isError)
}

/** How many lines are in the rows, headings left out. */
export function lineCount(items: readonly LogItem[]): number {
  return items.filter((item) => item.kind === 'line').length
}

/** The transcript as plain text for Copy all: every line, errors marked, filter ignored. */
export function logPlainText(lines: readonly LogTranscriptLine[]): string {
  return collapseRepeatedProgressLines(lines)
    .map((line) => `${isErrorLine(line) ? 'stderr ' : ''}${line.message}`)
    .join('\n')
}

export type LogStatusNote = Readonly<{ title: string; body: string }>

/** What to say in place of the lines when there are none yet, or never will be. */
export function emptyLogNote(state: CommandLogState): LogStatusNote {
  if (state === 'waiting') return { title: 'Waiting for output', body: 'The first lines show up here as soon as the server sends them.' }
  if (state === 'forbidden') {
    return { title: 'You cannot read this log', body: 'Your account cannot read the command that wrote it.' }
  }
  if (state === 'unavailable') {
    return {
      title: 'No log was kept',
      body: 'It may be past the time logs are kept, or this server does not keep them.',
    }
  }
  return { title: 'No output yet', body: 'Nothing has been written.' }
}

/** True while the log can still grow. */
export function isLiveLog(state: CommandLogState): boolean {
  return state === 'waiting' || state === 'streaming'
}
