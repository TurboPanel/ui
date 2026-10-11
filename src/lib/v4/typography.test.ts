import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FONT_FAMILIES,
  FONT_FAMILY_NAMES,
  fontFamily,
  TYPE_SCALE,
  type FontRole,
} from '@/lib/v4/typography'

const ROOT = path.resolve(import.meta.dirname, '../../..')
const LAYOUT = readFileSync(path.join(ROOT, 'src/app/_layout.tsx'), 'utf8')

/** `Name: require('@expo-google-fonts/pkg/dir/File.ttf')` lines of the useFonts map. */
function registeredFonts(): Map<string, string> {
  const found = new Map<string, string>()
  for (const [, name, file] of LAYOUT.matchAll(
    /(\w+): require\('(@expo-google-fonts\/[^']+\.ttf)'\)/g,
  )) {
    found.set(name, file)
  }
  return found
}

describe('v4 fonts', () => {
  it('registers exactly the families the roles name, each from a real file', () => {
    const registered = registeredFonts()
    expect([...registered.keys()].sort()).toEqual([...FONT_FAMILY_NAMES].sort())
    for (const [family, file] of registered) {
      expect(path.basename(file, '.ttf'), family).toBe(family)
      expect(existsSync(path.join(ROOT, 'node_modules', file)), file).toBe(true)
    }
  })

  it('gives every role its own family (a weight is a file, not a fontWeight)', () => {
    expect(new Set(FONT_FAMILY_NAMES).size).toBe(Object.keys(FONT_FAMILIES).length)
  })

  it('uses the display face for titles and Geist for the rest', () => {
    expect(FONT_FAMILIES.displayItalic).toBe('PlusJakartaSans_800ExtraBold_Italic')
    expect(FONT_FAMILIES.display).toBe('PlusJakartaSans_700Bold')
    expect(FONT_FAMILIES.bodyMedium).toBe('Geist_500Medium')
    expect(FONT_FAMILIES.monoMedium).toBe('GeistMono_500Medium')
  })

  it('names one family on a phone and adds a fallback list on the web', () => {
    for (const role of Object.keys(FONT_FAMILIES) as FontRole[]) {
      expect(fontFamily(role, false)).toBe(FONT_FAMILIES[role])
      expect(fontFamily(role, true).startsWith(`${FONT_FAMILIES[role]}, `)).toBe(true)
    }
    expect(fontFamily('mono', true)).toContain('ui-monospace')
    expect(fontFamily('body', true)).toContain('system-ui')
    expect(fontFamily('mono', true)).not.toContain('system-ui')
  })

  it('keeps the eight-size scale', () => {
    expect(Object.values(TYPE_SCALE)).toEqual([28, 20, 17, 14, 13, 12, 11, 12.5])
  })
})
