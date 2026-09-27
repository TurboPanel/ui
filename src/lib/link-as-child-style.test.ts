import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * On web, expo-router's `<Link asChild>` passes its child's `style` prop
 * straight to the DOM element. A style *array* there throws
 * "Failed to set an indexed property [0] on 'CSSStyleDeclaration'" and blanks
 * the whole screen (it did, on sign-in). The child of `Link asChild` must take
 * a single style object; put layout on a wrapping View instead.
 */
const SRC = join(__dirname, '..')

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : tsxFiles(path)
    return path.endsWith('.tsx') ? [path] : []
  })
}

/** The opening tag of the element directly inside each `<Link … asChild …>`. */
export function linkAsChildStyleArrays(source: string): number[] {
  const lines: number[] = []
  const pattern = /<Link\b[^>]*\basChild\b[^>]*>\s*<\w+((?:[^>]|\n)*?)>/g
  for (const match of source.matchAll(pattern)) {
    if (/\bstyle=\{\s*\[/.test(match[1] ?? '')) {
      lines.push(source.slice(0, match.index).split('\n').length)
    }
  }
  return lines
}

describe('Link asChild children', () => {
  it('flags a style array on the direct child', () => {
    const bad = '<Link href="/x" asChild>\n  <Pressable style={[a, b]}>\n'
    expect(linkAsChildStyleArrays(bad)).toEqual([1])
  })

  it('accepts a single style object', () => {
    const good = '<Link href="/x" asChild>\n  <Pressable style={webPointer}>\n'
    expect(linkAsChildStyleArrays(good)).toEqual([])
  })

  it('never passes a style array to the child of Link asChild anywhere in src', () => {
    const offenders = tsxFiles(SRC).flatMap((file) =>
      linkAsChildStyleArrays(readFileSync(file, 'utf8')).map(
        (line) => `${relative(SRC, file)}:${line}`,
      ),
    )
    expect(offenders).toEqual([])
  })
})
