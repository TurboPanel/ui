/**
 * Client-side parsing for command transcripts (execution logs).
 *
 * The daemon spools one redacted NDJSON `CommandOutputEvent` per captured line
 * (`turbopaneld/src/logs/contracts.ts`) and uploads those bytes verbatim, so a
 * transcript chunk read back from `GET /servers/:id/commands/:commandId/log`
 * is newline-delimited JSON. Two things still arrive as plain text and must not
 * break the parse:
 *
 * - the store's truncation marker, written once as raw text when the retained
 *   size cap trips;
 * - a chunk sliced mid-line by the reader's byte budget.
 *
 * Unparseable lines therefore degrade to a `stdout` line carrying the raw text
 * rather than being dropped.
 */

/** Which stream a transcript line came from. */
export type LogStream = 'stdout' | 'stderr'

/** One rendered transcript row. */
export type LogTranscriptLine = Readonly<{
  /** Per-command monotonic sequence from the daemon; synthetic for plain text. */
  seq: number
  /** ISO timestamp, or `null` when the line did not carry one. */
  timestamp: string | null
  stream: LogStream
  /** Daemon phase (`build`, `compose-up`, `managed-apply`, …) when known. */
  phase: string | null
  message: string
}>

/**
 * CSI / OSC escape sequences. Stripped rather than interpreted — see
 * `design-system/turbopanel/pages/deploy-logs.md` (ANSI).
 */
const ANSI_PATTERN =
  /[\u001B\u009B][[\]()#;?]*(?:\d{1,4}(?:;\d{0,4})*)?[0-9A-PR-TZcf-ntqry=><]/g // NOSONAR typescript:S6324 — \u001B / \u009B are the ANSI introducers being matched

/** Remove ANSI escape sequences and stray carriage returns from one line. */
export function stripAnsi(value: string): string {
  return value.replaceAll(ANSI_PATTERN, '').replaceAll('\r', '')
}

function normalizeStream(value: unknown): LogStream {
  return value === 'stderr' ? 'stderr' : 'stdout'
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Parse one NDJSON transcript line. Returns `null` when the line is not a
 * well-formed `CommandOutputEvent`, so the caller can fall back to plain text.
 */
function parseEventLine(raw: string): LogTranscriptLine | null {
  if (!raw.startsWith('{')) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null
  }
  const event = parsed as Record<string, unknown>
  if (typeof event.message !== 'string') return null
  if (!Number.isInteger(event.sequence)) return null
  return {
    seq: event.sequence as number,
    timestamp: normalizeOptionalString(event.timestamp),
    stream: normalizeStream(event.stream),
    phase: normalizeOptionalString(event.phase),
    message: stripAnsi(event.message),
  }
}

/**
 * Split a transcript chunk into rows.
 *
 * `fallbackSeq` seeds the synthetic sequence numbers used for plain-text lines
 * (truncation markers, legacy output) so they still sort after everything the
 * caller already holds. A trailing fragment without a newline is dropped: the
 * reader re-reads that chunk from its start on the next poll when a byte budget
 * split it, and {@link mergeTranscriptLines} dedupes the replay.
 */
export function parseCommandLogChunk(
  text: string,
  fallbackSeq = 0,
): LogTranscriptLine[] {
  if (text.length === 0) return []
  const rows: LogTranscriptLine[] = []
  const rawLines = text.split('\n')
  // The final element is either the empty string after a trailing newline or an
  // incomplete fragment; both are excluded (a split chunk is re-read in full).
  const lastIndex = rawLines.length - 1
  let syntheticSeq = fallbackSeq

  for (let index = 0; index < lastIndex; index++) {
    const raw = rawLines[index]
    if (raw === undefined) continue
    if (raw.length === 0) continue
    const event = parseEventLine(raw)
    if (event) {
      rows.push(event)
      continue
    }
    const message = stripAnsi(raw)
    if (message.trim().length === 0) continue
    syntheticSeq += 1
    rows.push({
      seq: syntheticSeq,
      timestamp: null,
      stream: 'stdout',
      phase: null,
      message,
    })
  }
  return rows
}

/**
 * Merge a freshly-read chunk into the accumulated transcript.
 *
 * The control-plane read may replay a chunk whose bytes did not fit the caller's
 * budget (`nextSeq` stays put in that case), so rows are keyed by their daemon
 * sequence and the later copy wins. Order is by sequence, ties broken by
 * arrival, which keeps plain-text rows adjacent to the events around them.
 */
export function mergeTranscriptLines(
  current: readonly LogTranscriptLine[],
  incoming: readonly LogTranscriptLine[],
): LogTranscriptLine[] {
  if (incoming.length === 0) return [...current]
  const byKey = new Map<string, LogTranscriptLine>()
  for (const line of current) {
    byKey.set(transcriptLineKey(line), line)
  }
  for (const line of incoming) {
    byKey.set(transcriptLineKey(line), line)
  }
  return [...byKey.values()].sort((a, b) => a.seq - b.seq)
}

/** Stable identity for one row — sequence plus stream (both are per command). */
export function transcriptLineKey(line: LogTranscriptLine): string {
  return `${line.seq}:${line.stream}`
}

/**
 * Adapt an unstructured log blob (the managed engine `docker logs` tail) to
 * transcript rows. Stream and timestamp are unknowable there, so every row is
 * `stdout` with no phase.
 */
export function plainTextTranscriptLines(text: string): LogTranscriptLine[] {
  const rows: LogTranscriptLine[] = []
  let seq = 0
  for (const raw of text.split('\n')) {
    const message = stripAnsi(raw)
    if (message.trim().length === 0) continue
    seq += 1
    rows.push({
      seq,
      timestamp: null,
      stream: 'stdout',
      phase: null,
      message,
    })
  }
  return rows
}

/** Plain text for Copy / Download — what the viewer shows, minus the chrome. */
export function transcriptPlainText(
  lines: readonly LogTranscriptLine[],
): string {
  return lines
    .map((line) => {
      const prefix = line.stream === 'stderr' ? 'stderr ' : ''
      return `${prefix}${line.message}`
    })
    .join('\n')
}

/** Consecutive rows sharing one phase, for the grouped renderer. */
export type LogTranscriptGroup = Readonly<{
  phase: string | null
  lines: readonly LogTranscriptLine[]
}>

/** Group consecutive lines by phase without reordering them. */
export function groupTranscriptByPhase(
  lines: readonly LogTranscriptLine[],
): LogTranscriptGroup[] {
  const groups: { phase: string | null; lines: LogTranscriptLine[] }[] = []
  for (const line of lines) {
    const last = groups.at(-1)
    if (last?.phase === line.phase) {
      last.lines.push(line)
      continue
    }
    groups.push({ phase: line.phase, lines: [line] })
  }
  return groups
}
