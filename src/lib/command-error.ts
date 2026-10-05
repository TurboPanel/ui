/**
 * What to show for a failed command or deploy.
 *
 * A daemon's failure text is a block of output with the cause printed last. The
 * control plane derives the one line that says what went wrong (`errorLine`);
 * an older control plane does not send it, so the last non-empty line of the
 * text stands in. The whole text stays reachable through
 * {@link commandErrorDetail}.
 */

/** The fields of a command, status row or deploy row that describe a failure. */
export type CommandErrorSource = {
  errorLine?: string | null
  errorMessage?: string | null
  /** Legacy alias of `errorMessage` on a full command record. */
  error?: string | null
}

/** Marker the daemon puts in front of an error whose start it cut off. */
const TRUNCATION_MARKER = /^\[\.\.\.truncated\]\s*/

const LINE_MAX_CHARS = 300

function fullText(source: CommandErrorSource): string | null {
  const text = source.errorMessage ?? source.error ?? null
  return text !== null && text.trim().length > 0 ? text : null
}

function lastLineOf(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((line, index) => (index === 0 ? line.replace(TRUNCATION_MARKER, '') : line).trim())
    .filter((line) => line.length > 0)
  const line = lines.at(-1)
  if (line === undefined) return null
  return line.length > LINE_MAX_CHARS ? `…${line.slice(line.length - LINE_MAX_CHARS + 1)}` : line
}

/** The one line that says why a command failed, or `null` when there is no error text. */
export function commandErrorLine(source: CommandErrorSource): string | null {
  const line = source.errorLine?.trim()
  if (line) return line
  const text = fullText(source)
  return text === null ? null : lastLineOf(text)
}

/**
 * The whole error text, only when it says more than {@link commandErrorLine}
 * already shows (a single short line is not worth a "details" control).
 */
export function commandErrorDetail(source: CommandErrorSource): string | null {
  const text = fullText(source)
  if (text === null) return null
  const line = commandErrorLine(source)
  const trimmed = text.replace(TRUNCATION_MARKER, '').trim()
  return trimmed === line ? null : trimmed
}
