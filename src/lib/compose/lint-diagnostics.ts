import type { ComposeLintIssue, ComposeLintLevel } from './lint'

/**
 * Shape-compatible with CodeMirror's `Diagnostic` (`@codemirror/lint`) without
 * importing CodeMirror from a module the native bundle can reach — keeps this
 * adapter usable from a plain unit test and from the web-only editor alike.
 */
export type ComposeLintDiagnostic = {
  from: number
  to: number
  severity: ComposeLintLevel
  message: string
}

/** Character offset range `[start, end)` for each line in `text` (no trailing newline). */
function lineOffsetRanges(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = []
  let start = 0
  for (const line of text.split('\n')) {
    ranges.push({ start, end: start + line.length })
    start += line.length + 1
  }
  return ranges
}

/**
 * Adapt {@link ComposeLintIssue}[] into CodeMirror lint `Diagnostic`-shaped
 * objects for the web YAML editor's lint gutter. `text` must be the exact
 * source the issues were computed from (line numbers are resolved against it).
 * Issues without a resolvable `line` are dropped — CodeMirror diagnostics
 * require a document range.
 */
export function composeLintIssuesToDiagnostics(
  text: string,
  issues: readonly ComposeLintIssue[],
): ComposeLintDiagnostic[] {
  const lineRanges = lineOffsetRanges(text)
  const diagnostics: ComposeLintDiagnostic[] = []
  for (const issue of issues) {
    if (issue.line === undefined) {
      continue
    }
    const range = lineRanges[issue.line - 1]
    if (!range) {
      continue
    }
    diagnostics.push({
      from: range.start,
      to: range.end,
      severity: issue.level,
      message: issue.message,
    })
  }
  return diagnostics
}
