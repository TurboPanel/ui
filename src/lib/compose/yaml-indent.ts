import {
  isComposeServicePropertyKey,
  isComposeTopLevelKey,
} from './lint'
import { indexOfYamlComment } from './yaml-highlight'

/** Default YAML indent — matches eemeli/yaml stringify used on save. */
export const YAML_INDENT = '  '

export type YamlEditResult = {
  text: string
  selection: { start: number; end: number }
}

/**
 * Leading whitespace of a single line (spaces/tabs only).
 */
export function leadingWhitespace(line: string): string {
  const match = /^[\t ]*/.exec(line)
  return match?.[0] ?? ''
}

/** Unquoted mapping key on a YAML line, or null. */
export function parseYamlMappingKey(line: string): string | null {
  const body = stripInlineComment(line)
  let i = 0
  while (i < body.length && (body[i] === ' ' || body[i] === '\t')) {
    i += 1
  }
  const keyStart = i
  // Key may not start with whitespace, `:`, or `#`.
  const first = body[i]
  if (first === undefined || first === ':' || first === '#') {
    return null
  }
  i += 1
  while (i < body.length) {
    const ch = body[i]
    if (ch === undefined || ch === ':' || ch === '#') {
      break
    }
    i += 1
  }
  if (body[i] !== ':') {
    return null
  }
  const key = body.slice(keyStart, i).trim()
  return key.length > 0 ? key : null
}

function isBlankOrCommentLine(line: string): boolean {
  const trimmed = stripInlineComment(line).trim()
  return trimmed.length === 0
}

/**
 * A bare key that is neither a Compose top-level key (`services`, `networks`,
 * …) nor a known service-body field (`image`, `restart`, …) — i.e. a
 * user-defined name such as a service, network, or volume name.
 */
function isComposeUserDefinedNameKey(key: string): boolean {
  return !isComposeTopLevelKey(key) && !isComposeServicePropertyKey(key)
}

/** Full-line YAML comment (`# …`), optionally indented. */
export function isFullLineComment(line: string): boolean {
  return line.trimStart().startsWith('#')
}

function isBlankLine(line: string): boolean {
  return line.trim().length === 0
}

/**
 * Resolve the expected indent for a line given a preceding block opener that
 * is a YAML ancestor of the current line (opener indent strictly less than
 * the current indent). Extracted from {@link expectedIndentForLine} to keep
 * cognitive complexity in check.
 */
function resolveIndentAgainstOpener(
  currentIndent: number,
  currentKey: string,
  previous: string,
): number | null {
  const previousIndent = leadingWhitespace(previous).length
  const childIndent = previousIndent + YAML_INDENT.length
  if (currentIndent >= childIndent) {
    return null
  }

  const previousKey = parseYamlMappingKey(previous)
  if (
    currentIndent === 0 &&
    isComposeTopLevelKey(currentKey) &&
    previousIndent === 0 &&
    previousKey &&
    isComposeTopLevelKey(previousKey)
  ) {
    return null
  }

  // A user-defined name (e.g. a service under `services:`) does not turn a
  // following unrecognized bare key into one of its fields — that key is
  // far more likely a sibling name the user is still typing (a second
  // service, network, …). Only re-indent it once it no longer matches the
  // sibling depth; never deepen it under the previous name.
  if (
    previousKey &&
    isComposeUserDefinedNameKey(previousKey) &&
    isComposeUserDefinedNameKey(currentKey)
  ) {
    return currentIndent === previousIndent ? null : previousIndent
  }

  return childIndent
}

/**
 * Column-0 recovery when every prior block opener has already been closed by
 * the current line's indentation. Fixes common under-indent mistakes (service
 * names left at the root) without reopening nested maps such as a service's
 * `networks:` list. Service-body keys are handled earlier via
 * {@link expectedServicePropertyIndent}.
 */
function expectedIndentForUnderIndentedRoot(
  lines: readonly string[],
  lineIndex: number,
  currentIndent: number,
  currentKey: string,
): number | null {
  if (currentIndent > 0) {
    // Already nested relative to the document root, but no shallower ancestor
    // opener exists — structure is ambiguous; leave alone.
    return null
  }

  // User-defined names left at column 0: deepen under the open top-level
  // section (usually `services:`), or align with a preceding service-name
  // sibling. Dual top-level/service keys (`networks`, `volumes`) at column 0
  // after a service stay put so a new top-level section is not swallowed.
  for (let index = lineIndex - 1; index >= 0; index -= 1) {
    const previous = lines[index] ?? ''
    if (isBlankOrCommentLine(previous) || !lineOpensBlock(previous)) {
      continue
    }
    const previousIndent = leadingWhitespace(previous).length
    const previousKey = parseYamlMappingKey(previous)
    if (!previousKey) {
      continue
    }

    // Align a second service/network/volume name with the previous one.
    if (
      isComposeUserDefinedNameKey(previousKey) &&
      isComposeUserDefinedNameKey(currentKey) &&
      previousIndent > 0
    ) {
      return previousIndent
    }

    // Nest under a top-level section (`services:`, `networks:`, …).
    if (previousIndent === 0 && isComposeTopLevelKey(previousKey)) {
      if (isComposeTopLevelKey(currentKey)) {
        return null
      }
      return YAML_INDENT.length
    }
  }

  return null
}

/**
 * Expected leading spaces for an under-indented line nested under a preceding
 * block opener. Returns null when the line is already indented enough or when
 * the expected depth cannot be inferred safely.
 *
 * Important: only openers whose indent is **strictly less** than the current
 * line are considered parents. YAML closes a mapping once a later line is
 * indented at or left of that key — so a service-level `  nginx2:` after a
 * nested `    networks:` list must not re-open `networks` as its parent
 * (that wrongly turns the next service into a network name).
 */
export function expectedIndentForLine(
  lines: readonly string[],
  lineIndex: number,
): number | null {
  const line = lines[lineIndex]
  if (line === undefined || isBlankOrCommentLine(line)) {
    return null
  }

  const currentIndent = leadingWhitespace(line).length
  const currentKey = parseYamlMappingKey(line)
  if (!currentKey) {
    return null
  }

  if (currentIndent === 0 && isComposeTopLevelKey(currentKey)) {
    return null
  }

  // Known service-body keys must nest under a service name even when their
  // current indent would also be a valid YAML sibling of that service
  // (`  image:` next to `  nginx:`). Check before the ancestor walk so a
  // shallow service property is not treated as a second service.
  if (isComposeServicePropertyKey(currentKey)) {
    const expected = expectedServicePropertyIndent(lines, lineIndex)
    if (expected !== null && currentIndent < expected) {
      return expected
    }
    if (expected !== null) {
      return null
    }
  }

  for (let index = lineIndex - 1; index >= 0; index -= 1) {
    const previous = lines[index] ?? ''
    if (isBlankOrCommentLine(previous) || !lineOpensBlock(previous)) {
      continue
    }
    const previousIndent = leadingWhitespace(previous).length
    // Sibling or already-closed deeper nest — not a parent of this line.
    if (previousIndent >= currentIndent) {
      continue
    }
    return resolveIndentAgainstOpener(currentIndent, currentKey, previous)
  }

  return expectedIndentForUnderIndentedRoot(
    lines,
    lineIndex,
    currentIndent,
    currentKey,
  )
}

/**
 * Target indent for a full-line comment: match the following content line
 * (using that line's expected indent when it is under-indented), else nest
 * under the previous block opener / align with the previous sibling.
 * Returns null when the comment is already correct.
 */
export function expectedIndentForCommentLine(
  lines: readonly string[],
  lineIndex: number,
): number | null {
  const line = lines[lineIndex]
  if (line === undefined || !isFullLineComment(line)) {
    return null
  }

  const currentIndent = leadingWhitespace(line).length

  for (let index = lineIndex + 1; index < lines.length; index += 1) {
    const next = lines[index] ?? ''
    if (isBlankLine(next) || isFullLineComment(next)) {
      continue
    }
    const expectedForNext = expectedIndentForLine(lines, index)
    const target = expectedForNext ?? leadingWhitespace(next).length
    return currentIndent === target ? null : target
  }

  for (let index = lineIndex - 1; index >= 0; index -= 1) {
    const previous = lines[index] ?? ''
    if (isBlankLine(previous) || isFullLineComment(previous)) {
      continue
    }
    const target = lineOpensBlock(previous)
      ? leadingWhitespace(previous).length + YAML_INDENT.length
      : leadingWhitespace(previous).length
    return currentIndent === target ? null : target
  }

  return currentIndent === 0 ? null : 0
}

function mapSelectionThroughLineRewrites(
  prev: string,
  next: string,
  selection: { start: number; end: number },
): { start: number; end: number } {
  if (prev === next) {
    return selection
  }
  const prevLines = prev.split('\n')
  const nextLines = next.split('\n')
  let prevPos = 0
  let nextPos = 0
  let start = selection.start
  let end = selection.end

  for (let i = 0; i < prevLines.length; i += 1) {
    const prevLine = prevLines[i] ?? ''
    const nextLine = nextLines[i] ?? prevLine
    const delta = nextLine.length - prevLine.length
    const lineEnd = prevPos + prevLine.length

    if (selection.start > lineEnd) {
      start += delta
    } else if (selection.start >= prevPos) {
      const local = selection.start - prevPos
      start = nextPos + Math.min(Math.max(local + delta, 0), nextLine.length)
      // Caret in leading whitespace: prefer staying on the content when indent grows.
      if (local <= leadingWhitespace(prevLine).length) {
        start = nextPos + Math.min(local + Math.max(delta, 0), nextLine.length)
      }
    }

    if (selection.end > lineEnd) {
      end += delta
    } else if (selection.end >= prevPos) {
      const local = selection.end - prevPos
      end = nextPos + Math.min(Math.max(local + delta, 0), nextLine.length)
      if (local <= leadingWhitespace(prevLine).length) {
        end = nextPos + Math.min(local + Math.max(delta, 0), nextLine.length)
      }
    }

    prevPos += prevLine.length + 1
    nextPos += nextLine.length + 1
  }

  return {
    start: Math.max(0, Math.min(start, next.length)),
    end: Math.max(0, Math.min(end, next.length)),
  }
}

/**
 * Target indent for a content or full-line-comment line, or null when the
 * line should be left alone.
 */
function expectedIndentForEditableLine(
  lines: readonly string[],
  lineIndex: number,
  line: string,
): number | null {
  if (isFullLineComment(line)) {
    return expectedIndentForCommentLine(lines, lineIndex)
  }
  return expectedIndentForLine(lines, lineIndex)
}

/**
 * Whether {@link rewriteLineToExpectedIndent} should apply `expected` to
 * `line`. Keys only deepen when under-indented; comments snap either way.
 */
function shouldRewriteLineIndent(
  line: string,
  expected: number,
): boolean {
  const current = leadingWhitespace(line).length
  if (current === expected) {
    return false
  }
  // Keys only deepen when under-indented; comments snap to the target depth.
  if (!isFullLineComment(line) && current >= expected) {
    return false
  }
  return true
}

/** Rewrite `lines[lineIndex]` to `expected` leading spaces. */
function rewriteLineToExpectedIndent(
  lines: string[],
  lineIndex: number,
  line: string,
  expected: number,
): void {
  lines[lineIndex] = `${' '.repeat(expected)}${line.trimStart()}`
}

/**
 * One pass over every line: deepen under-indented keys and snap comments.
 * Returns true when at least one line changed.
 */
function rewriteUnderIndentedLinesPass(lines: string[]): boolean {
  let passChanged = false
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]
    if (line === undefined) {
      continue
    }
    const expected = expectedIndentForEditableLine(lines, lineIndex, line)
    if (expected === null || !shouldRewriteLineIndent(line, expected)) {
      continue
    }
    rewriteLineToExpectedIndent(lines, lineIndex, line, expected)
    passChanged = true
  }
  return passChanged
}

/**
 * Fix common compose under-indent mistakes (service names/properties left at
 * column 0 or one level too shallow) and realign full-line comments with their
 * surrounding block. Returns null when nothing changed.
 */
export function fixComposeYamlIndentation(
  text: string,
  selection?: { start: number; end: number },
): YamlEditResult | null {
  const lines = text.split('\n')
  let changed = false

  for (let pass = 0; pass < lines.length + 1; pass += 1) {
    if (!rewriteUnderIndentedLinesPass(lines)) {
      break
    }
    changed = true
  }

  if (!changed) {
    return null
  }

  const nextText = lines.join('\n')
  const nextSelection = selection
    ? mapSelectionThroughLineRewrites(text, nextText, selection)
    : { start: nextText.length, end: nextText.length }

  return {
    text: nextText,
    selection: nextSelection,
  }
}

/** True when {@link fixComposeYamlIndentation} would rewrite the YAML. */
export function canFixComposeYamlIndentation(text: string): boolean {
  return fixComposeYamlIndentation(text) !== null
}

/** Remove trailing spaces/tabs on every line (keeps line structure). */
export function trimTrailingWhitespacePerLine(text: string): string {
  return text.split('\n').map(trimTrailingSpacesAndTabs).join('\n')
}

function trimTrailingSpacesAndTabs(line: string): string {
  let end = line.length
  while (end > 0) {
    const ch = line[end - 1]
    if (ch !== ' ' && ch !== '\t') {
      break
    }
    end -= 1
  }
  return end === line.length ? line : line.slice(0, end)
}

/** 0-based line index containing `offset` (clamped to the document). */
export function lineIndexAtOffset(text: string, offset: number): number {
  const clamped = Math.max(0, Math.min(offset, text.length))
  let line = 0
  for (let i = 0; i < clamped; i += 1) {
    if (text[i] === '\n') {
      line += 1
    }
  }
  return line
}

/**
 * Map a caret offset through {@link trimTrailingWhitespacePerLine}.
 * Offsets in trimmed trailing whitespace snap to the new line end.
 */
export function mapOffsetThroughPerLineTrim(
  prev: string,
  next: string,
  offset: number,
): number {
  if (prev === next) {
    return Math.max(0, Math.min(offset, next.length))
  }
  const prevLines = prev.split('\n')
  const nextLines = next.split('\n')
  let prevPos = 0
  let nextPos = 0
  const target = Math.max(0, Math.min(offset, prev.length))

  for (let i = 0; i < prevLines.length; i += 1) {
    const prevLine = prevLines[i] ?? ''
    const nextLine = nextLines[i] ?? prevLine
    const lineStart = prevPos
    const lineEnd = prevPos + prevLine.length

    if (target <= lineEnd) {
      const local = target - lineStart
      return nextPos + Math.min(local, nextLine.length)
    }

    prevPos = lineEnd + 1
    nextPos += nextLine.length + 1
  }

  return next.length
}

/**
 * When the caret moves to another line: right-trim and fix under-indent.
 * No-op for multi-caret selections. Returns null when nothing changes.
 */
export function formatComposeYamlOnLineChange(
  text: string,
  selection: { start: number; end: number },
): YamlEditResult | null {
  if (selection.start !== selection.end) {
    return null
  }

  const trimmed = trimTrailingWhitespacePerLine(text)
  const mapped = {
    start: mapOffsetThroughPerLineTrim(text, trimmed, selection.start),
    end: mapOffsetThroughPerLineTrim(text, trimmed, selection.end),
  }
  const fixed = fixComposeYamlIndentation(trimmed, mapped)
  if (fixed) {
    return fixed
  }
  if (trimmed === text) {
    return null
  }
  return { text: trimmed, selection: mapped }
}

/**
 * True when the line opens a nested block (key with no same-line value).
 *
 * `services:` / `  nginx:` / `    ports:` → true
 * `    image: nginx` / `  - "80:80"` → false
 */
export function lineOpensBlock(line: string): boolean {
  const trimmed = stripInlineComment(line).trimEnd()
  if (trimmed.length === 0) {
    return false
  }
  // Flow collections on one line are not block openers for indent purposes.
  if (trimmed.endsWith('{') || trimmed.endsWith('[') || trimmed.endsWith(',')) {
    return false
  }
  if (!trimmed.endsWith(':')) {
    return false
  }
  const colonIndex = trimmed.lastIndexOf(':')
  const afterColon = trimmed.slice(colonIndex + 1).trim()
  return afterColon.length === 0
}

/**
 * Indent to insert on the new line after pressing Enter on `lineBeforeCursor`.
 */
export function indentAfterNewline(lineBeforeCursor: string): string {
  const base = leadingWhitespace(lineBeforeCursor)
  if (lineOpensBlock(lineBeforeCursor)) {
    return `${base}${YAML_INDENT}`
  }
  return base
}

/**
 * Expected indent (space count) for a service property on `lines[lineIndex]`,
 * inferred from earlier lines under `services:`. Null when not inside a service.
 */
export function expectedServicePropertyIndent(
  lines: readonly string[],
  lineIndex: number,
): number | null {
  for (let index = lineIndex - 1; index >= 0; index -= 1) {
    const line = lines[index] ?? ''
    if (isBlankOrCommentLine(line)) {
      continue
    }

    const indent = leadingWhitespace(line).length
    const key = parseYamlMappingKey(line)

    if (key && isComposeServicePropertyKey(key)) {
      return indent
    }

    if (key === 'services' && lineOpensBlock(line)) {
      return null
    }

    if (
      key &&
      indent === 0 &&
      isComposeTopLevelKey(key) &&
      key !== 'services'
    ) {
      return null
    }

    // Service name (`  nginx:`) — properties nest one level deeper.
    if (key && lineOpensBlock(line) && isComposeUserDefinedNameKey(key)) {
      return indent + YAML_INDENT.length
    }
  }
  return null
}

/**
 * Re-indent a service-only key that was left too shallow (e.g. `restart:` at
 * column 0 while still inside a service). Returns null when no change.
 */
export function fixUnderIndentedServiceKeyLine(
  text: string,
  lineIndex: number,
): { text: string; indentDelta: number } | null {
  const lines = text.split('\n')
  const line = lines[lineIndex]
  if (line === undefined) {
    return null
  }

  const key = parseYamlMappingKey(line)
  if (!key || !isComposeServicePropertyKey(key)) {
    return null
  }

  const expected = expectedServicePropertyIndent(lines, lineIndex)
  if (expected === null) {
    return null
  }

  const current = leadingWhitespace(line).length
  if (current >= expected) {
    return null
  }

  const indentDelta = expected - current
  lines[lineIndex] = `${' '.repeat(expected)}${line.trimStart()}`
  return { text: lines.join('\n'), indentDelta }
}

/**
 * If `next` is `prev` with a single `\n` inserted:
 * - re-indent a misplaced service property on the completed line (when needed)
 * - right-trim every line (trailing spaces/tabs)
 * - indent the new line
 *
 * Returns null when nothing changed beyond the raw newline.
 */
export function applyNewlineAutoIndent(
  prev: string,
  next: string,
): YamlEditResult | null {
  if (next.length !== prev.length + 1) {
    return null
  }
  let insertAt = -1
  for (let i = 0; i < next.length; i++) {
    if (next.codePointAt(i) === prev.codePointAt(i)) {
      continue
    }
    if (next[i] === '\n' && next.slice(i + 1) === prev.slice(i)) {
      insertAt = i
      break
    }
    return null
  }
  if (insertAt < 0) {
    return null
  }

  let text = next
  const completedLineIndex = text.slice(0, insertAt).split('\n').length - 1
  const fixed = fixUnderIndentedServiceKeyLine(text, completedLineIndex)
  if (fixed) {
    text = fixed.text
    insertAt += fixed.indentDelta
  }

  // Decide new-line indent from the completed line before right-trimming it
  // (indent-only lines would otherwise collapse to empty and lose context).
  const lineStart = text.lastIndexOf('\n', insertAt - 1) + 1
  const lineBefore = text.slice(lineStart, insertAt)
  const indent = indentAfterNewline(lineBefore)

  const before = text.slice(0, insertAt)
  const after = text.slice(insertAt + 1)
  const trimmedBefore = trimTrailingWhitespacePerLine(before)
  const trimmedAfter = trimTrailingWhitespacePerLine(after)
  const didTrim = trimmedBefore !== before || trimmedAfter !== after
  text = `${trimmedBefore}\n${trimmedAfter}`
  insertAt = trimmedBefore.length

  if (indent.length === 0 && !fixed && !didTrim) {
    return null
  }

  const withIndent = `${text.slice(0, insertAt + 1)}${indent}${text.slice(insertAt + 1)}`
  const cursor = insertAt + 1 + indent.length
  return { text: withIndent, selection: { start: cursor, end: cursor } }
}

/**
 * Insert two spaces at the cursor, or indent every line in a multi-line selection.
 * When the caret sits in a line's leading whitespace, the whole line is indented.
 */
export function applyTabIndent(
  text: string,
  selection: { start: number; end: number },
): YamlEditResult {
  const { start, end } = selection
  if (start !== end) {
    return transformSelectedLines(text, start, end, (line) => `${YAML_INDENT}${line}`)
  }

  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const lineEndIndex = text.indexOf('\n', lineStart)
  const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex
  const line = text.slice(lineStart, lineEnd)
  const caretColumn = start - lineStart
  const leading = leadingWhitespace(line).length

  if (caretColumn <= leading) {
    return transformSelectedLines(text, start, end, (entry) => `${YAML_INDENT}${entry}`)
  }

  const next = `${text.slice(0, start)}${YAML_INDENT}${text.slice(end)}`
  const cursor = start + YAML_INDENT.length
  return { text: next, selection: { start: cursor, end: cursor } }
}

/**
 * Remove one indent unit from the current line (or each selected line).
 */
export function applyTabOutdent(
  text: string,
  selection: { start: number; end: number },
): YamlEditResult {
  return transformSelectedLines(text, selection.start, selection.end, removeOneIndent)
}

function transformSelectedLines(
  text: string,
  start: number,
  end: number,
  transformLine: (line: string) => string,
): YamlEditResult {
  const range = expandToLineRange(text, start, end)
  const block = text.slice(range.start, range.end)
  const lines = block.split('\n')
  let leadingDelta = 0
  let totalDelta = 0

  const rewritten = lines.map((line, index) => {
    const nextLine = transformLine(line)
    const delta = nextLine.length - line.length
    if (index === 0) {
      leadingDelta = delta
    }
    totalDelta += delta
    return nextLine
  }).join('\n')

  const next = `${text.slice(0, range.start)}${rewritten}${text.slice(range.end)}`
  const nextStart = clamp(start + leadingDelta, range.start, next.length)
  const nextEnd = clamp(end + totalDelta, nextStart, next.length)
  return { text: next, selection: { start: nextStart, end: nextEnd } }
}

/** Inclusive line-start / exclusive line-end covering the caret or selection. */
function expandToLineRange(
  text: string,
  start: number,
  end: number,
): { start: number; end: number } {
  const rangeStart = text.lastIndexOf('\n', start - 1) + 1
  if (start === end) {
    const nl = text.indexOf('\n', rangeStart)
    return { start: rangeStart, end: nl === -1 ? text.length : nl }
  }
  // Selection ending exactly on a newline excludes the following line.
  const endAnchor = text[end - 1] === '\n' ? end - 1 : end
  const nl = text.indexOf('\n', endAnchor)
  const rangeEnd = nl === -1 ? text.length : nl
  return { start: rangeStart, end: rangeEnd }
}

function removeOneIndent(line: string): string {
  if (line.startsWith(YAML_INDENT)) {
    return line.slice(YAML_INDENT.length)
  }
  if (line.startsWith('\t')) {
    return line.slice(1)
  }
  if (line.startsWith(' ')) {
    return line.slice(1)
  }
  return line
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Strip a `# …` comment that is not inside a quoted scalar (best-effort). */
function stripInlineComment(line: string): string {
  const hashIndex = indexOfYamlComment(line)
  return hashIndex < 0 ? line : line.slice(0, hashIndex)
}
