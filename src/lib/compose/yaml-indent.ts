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
 * If `next` is `prev` with a single `\n` inserted, return text with YAML indent
 * after that newline and the cursor after the indent. Otherwise `null`.
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

  const lineStart = prev.lastIndexOf('\n', insertAt - 1) + 1
  const lineBefore = prev.slice(lineStart, insertAt)
  const indent = indentAfterNewline(lineBefore)
  if (indent.length === 0) {
    return null
  }

  const text = `${next.slice(0, insertAt + 1)}${indent}${next.slice(insertAt + 1)}`
  const cursor = insertAt + 1 + indent.length
  return { text, selection: { start: cursor, end: cursor } }
}

/**
 * Insert two spaces at the cursor, or indent every line in a multi-line selection.
 */
export function applyTabIndent(
  text: string,
  selection: { start: number; end: number },
): YamlEditResult {
  const { start, end } = selection
  if (start !== end) {
    return transformSelectedLines(text, start, end, (line) => `${YAML_INDENT}${line}`)
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
