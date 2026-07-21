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
  const match = /^[\t ]*([^:#\s][^:#]*?)\s*:/.exec(stripInlineComment(line))
  if (!match?.[1]) {
    return null
  }
  return match[1].trim()
}

function isBlankOrCommentLine(line: string): boolean {
  const trimmed = stripInlineComment(line).trim()
  return trimmed.length === 0
}

/**
 * Expected leading spaces for an under-indented line nested under a preceding
 * block opener. Returns null when the line is already indented enough or when
 * the expected depth cannot be inferred safely.
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

  for (let index = lineIndex - 1; index >= 0; index -= 1) {
    const previous = lines[index] ?? ''
    if (isBlankOrCommentLine(previous)) {
      continue
    }

    if (!lineOpensBlock(previous)) {
      continue
    }

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

    return childIndent
  }

  return null
}

function lineStartOffset(text: string, lineIndex: number): number {
  if (lineIndex <= 0) {
    return 0
  }
  let offset = 0
  for (let index = 0; index < lineIndex; index += 1) {
    offset = text.indexOf('\n', offset) + 1
  }
  return offset
}

function adjustSelectionForLineIndent(
  selection: { start: number; end: number },
  lineStart: number,
  indentDelta: number,
): { start: number; end: number } {
  if (indentDelta <= 0) {
    return selection
  }
  return {
    start: selection.start >= lineStart ? selection.start + indentDelta : selection.start,
    end: selection.end >= lineStart ? selection.end + indentDelta : selection.end,
  }
}

/**
 * Fix common compose under-indent mistakes (service names/properties left at
 * column 0 or one level too shallow). Returns null when nothing changed.
 */
export function fixComposeYamlIndentation(
  text: string,
  selection?: { start: number; end: number },
): YamlEditResult | null {
  const lines = text.split('\n')
  let changed = false
  let nextSelection = selection ?? { start: text.length, end: text.length }

  for (let pass = 0; pass < lines.length + 1; pass += 1) {
    let passChanged = false
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex]
      if (line === undefined) {
        continue
      }

      const expected = expectedIndentForLine(lines, lineIndex)
      if (expected === null) {
        continue
      }

      const current = leadingWhitespace(line).length
      if (current >= expected) {
        continue
      }

      const indentDelta = expected - current
      lines[lineIndex] = `${' '.repeat(expected)}${line.trimStart()}`
      nextSelection = adjustSelectionForLineIndent(
        nextSelection,
        lineStartOffset(text, lineIndex),
        indentDelta,
      )
      passChanged = true
      changed = true
    }
    if (!passChanged) {
      break
    }
  }

  if (!changed) {
    return null
  }

  return {
    text: lines.join('\n'),
    selection: nextSelection,
  }
}

/** True when {@link fixComposeYamlIndentation} would rewrite the YAML. */
export function canFixComposeYamlIndentation(text: string): boolean {
  return fixComposeYamlIndentation(text) !== null
}

/** Remove trailing spaces/tabs on every line (keeps line structure). */
export function trimTrailingWhitespacePerLine(text: string): string {
  return text.split('\n').map((line) => line.replace(/[ \t]+$/u, '')).join('\n')
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
    if (
      key &&
      lineOpensBlock(line) &&
      !isComposeServicePropertyKey(key) &&
      !isComposeTopLevelKey(key)
    ) {
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
