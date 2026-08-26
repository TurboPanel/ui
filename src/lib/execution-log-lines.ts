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

/**
 * Benign status words Compose / BuildKit print while a deploy runs.
 *
 * Docker writes **all** progress to stderr — stdout is reserved for command
 * results — so a viewer that equates "stderr" with "error" paints an entire
 * successful image pull red. Recognising these separates a layer download from
 * a real diagnostic. `Error` and `Warning` are deliberately absent: those stay
 * flagged. Matched as whole phrases, so a multi-word status is never mistaken
 * for its first word.
 */
const DOCKER_PROGRESS_STATUSES = [
  'Pulling fs layer',
  'Verifying Checksum',
  'Download complete',
  'Already exists',
  'Pull complete',
  'Downloading',
  'Restarting',
  'Recreating',
  'Extracting',
  'Recreated',
  'Uploading',
  'Restarted',
  'Building',
  'Creating',
  'Removing',
  'Stopping',
  'Starting',
  'Skipped',
  'Waiting',
  'Healthy',
  'Running',
  'Pulling',
  'Pushing',
  'Removed',
  'Stopped',
  'Started',
  'Created',
  'Killing',
  'Pulled',
  'Killed',
  'Pushed',
  'Exists',
  'Built',
]

/** Lookup for {@link DOCKER_PROGRESS_STATUSES}, keyed by the status phrase. */
const DOCKER_PROGRESS_STATUS_SET = new Set(DOCKER_PROGRESS_STATUSES)

/** Longest status phrase, in words — `Pulling fs layer`. */
const DOCKER_PROGRESS_STATUS_WORDS = Math.max(
  ...DOCKER_PROGRESS_STATUSES.map((status) => status.split(' ').length),
)

/**
 * Compose prints the byte counter for every event, including the ones that have
 * no bytes: `Pulling fs layer 0B`, `Download complete 0B`, `Extracting 1B`.
 * The number is an artefact of the writer, not a size.
 */
function stripEmptyProgressSize(message: string): string {
  if (!message.endsWith('0B') && !message.endsWith('1B')) return message
  const withoutCounter = message.slice(0, -2)
  const trimmed = withoutCounter.trimEnd()
  if (trimmed.length === withoutCounter.length) return message
  return trimmed
}

/**
 * True when a line is ordinary Docker progress rather than a diagnostic.
 *
 * `<name…> <Status> [<statusText>]` — Compose's plain-progress writer prints
 * exactly `id text statusText`, where the id half can be several words
 * (`Image adminer:latest`, `Container web-1`). Matched by scanning the tail
 * tokens rather than with one regex: the id half is unbounded, so a pattern
 * that lets it swallow spaces backtracks over the whole line on every miss.
 */
export function isDockerProgressLine(message: string): boolean {
  const words = message.split(/\s+/).filter((word) => word.length > 0)
  // The status never opens the line — an id always precedes it …
  for (let trailing = 0; trailing <= 1; trailing++) {
    // … and at most one word of `statusText` may follow it.
    const end = words.length - trailing
    for (let size = 1; size <= DOCKER_PROGRESS_STATUS_WORDS; size++) {
      const start = end - size
      if (start < 1) break
      if (DOCKER_PROGRESS_STATUS_SET.has(words.slice(start, end).join(' '))) {
        return true
      }
    }
  }
  return false
}

/**
 * A row is an error when it came from stderr **and** is not Docker progress.
 * Never `stream === 'stderr'` on its own — see {@link DOCKER_PROGRESS_STATUSES}.
 */
export function isErrorLine(line: LogTranscriptLine): boolean {
  return line.stream === 'stderr' && !isDockerProgressLine(line.message)
}

/** Trim trailing space and Compose's meaningless `0B` / `1B` counter. */
export function normalizeTranscriptMessage(message: string): string {
  const trimmed = message.trimEnd()
  if (!isDockerProgressLine(trimmed)) return trimmed
  return stripEmptyProgressSize(trimmed)
}

/**
 * Drop consecutive progress rows whose text repeats. Compose emits one line per
 * tick — `Extracting` four times, `Network … Creating` twice — and overwrites
 * them in place in its own TTY renderer; a scrolling transcript should not
 * stutter instead. Only progress rows collapse: repeated build or app output is
 * real output and stays.
 */
export function collapseRepeatedProgressLines(
  lines: readonly LogTranscriptLine[],
): LogTranscriptLine[] {
  const rows: LogTranscriptLine[] = []
  for (const line of lines) {
    const previous = rows.at(-1)
    if (
      previous?.message === line.message &&
      previous?.phase === line.phase &&
      previous?.stream === line.stream &&
      isDockerProgressLine(line.message)
    ) {
      continue
    }
    rows.push(line)
  }
  return rows
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
    message: normalizeTranscriptMessage(stripAnsi(event.message)),
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

/** RFC3339Nano prefix from `docker container logs --timestamps`. */
const DOCKER_TIMESTAMP_RE =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))\s(.*)$/

/**
 * Adapt a `docker container logs --timestamps` snapshot to transcript rows.
 * Lines without a leading RFC3339 stamp degrade like {@link plainTextTranscriptLines}.
 */
export function dockerTimestampTranscriptLines(
  text: string,
): LogTranscriptLine[] {
  const rows: LogTranscriptLine[] = []
  let seq = 0
  for (const raw of text.split('\n')) {
    const stripped = stripAnsi(raw)
    if (stripped.trim().length === 0) continue
    seq += 1
    const match = DOCKER_TIMESTAMP_RE.exec(stripped)
    rows.push({
      seq,
      timestamp: match?.[1] ?? null,
      stream: 'stdout',
      phase: null,
      message: match?.[2] ?? stripped,
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
      const prefix = isErrorLine(line) ? 'stderr ' : ''
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
