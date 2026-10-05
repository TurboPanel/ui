import { describe, expect, it } from 'vitest'
import {
  colorTokens,
  cssVarName,
  cssVarRef,
  navyPalette,
  paletteFor,
  paperPalette,
  themeCss,
  type Palette,
  type PaletteKey,
} from '@/lib/theme-palettes'

type Rgb = readonly [number, number, number]
type Rgba = readonly [number, number, number, number]

function parseColor(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)
  if (hex) {
    const n = Number.parseInt(hex[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]
  }
  const rgba = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(value)
  if (rgba) return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), Number(rgba[4])]
  throw new Error(`not a plain colour: ${value}`)
}

/** `top` laid over an opaque `under`, like the browser does. */
function over(top: string, under: Rgb): Rgb {
  const [r, g, b, a] = parseColor(top)
  return [
    Math.round(r * a + under[0] * (1 - a)),
    Math.round(g * a + under[1] * (1 - a)),
    Math.round(b * a + under[2] * (1 - a)),
  ]
}

function opaque(value: string, under: Rgb): Rgb {
  return over(value, under)
}

function luminance([r, g, b]: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function ratio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const THEMES = [
  ['Navy (dark)', navyPalette],
  ['Paper (light)', paperPalette],
] as const

describe.each(THEMES)('%s contrast', (_name, p: Palette) => {
  const page = opaque(p.bg, [0, 0, 0])
  const surface = opaque(p.surface, page)

  it.each(['ok', 'busy', 'warn', 'bad', 'idle', 'base'] as const)(
    'v4 table: %s text reads on the surface and on its soft tint',
    (tone) => {
      const text = opaque(p[tone], surface)
      expect(ratio(text, surface)).toBeGreaterThanOrEqual(4.5)
      const soft = over(p[`${tone}Soft` as PaletteKey], surface)
      expect(ratio(text, soft)).toBeGreaterThanOrEqual(4.5)
    },
  )

  it('keeps body text, secondary text, links and the third text level readable', () => {
    for (const key of ['text', 'text2', 'text3', 'link'] as const) {
      expect(ratio(opaque(p[key], surface), surface)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('puts white on the primary action at 4.5:1 or better', () => {
    expect(ratio(opaque(p.accentInk, [0, 0, 0]), opaque(p.accent, surface))).toBeGreaterThanOrEqual(4.5)
    expect(ratio(opaque(p.buttonText, [0, 0, 0]), opaque(p.accent, surface))).toBeGreaterThanOrEqual(4.5)
    expect(ratio(opaque(p.buttonTextOnBlue, [0, 0, 0]), opaque(p.blue, surface))).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps input and checkbox boundaries at 3:1 against the surface and the field', () => {
    for (const under of [surface, opaque(p.field, page)]) {
      expect(ratio(over(p.fieldBorder, under), under)).toBeGreaterThanOrEqual(3)
    }
  })

  // The old key names are what the screens that were not rebuilt still read.
  const legacyText: PaletteKey[] = [
    'text', 'textTitle', 'textBody', 'textMuted', 'textDim', 'textFaint',
    'textLabel', 'textChip', 'stdout', 'command', 'green', 'errorText',
    'error', 'errorSoft', 'pending', 'log',
  ]
  const legacySurfaces: PaletteKey[] = [
    'bg', 'bgPanel', 'bgArea', 'bgAreaHeader', 'bgInput', 'bgSecondary',
    'bgInset', 'bgSidebar', 'bgActive',
  ]
  it.each(legacyText)('old text key %s reads on every old surface key', (textKey) => {
    for (const surfaceKey of legacySurfaces) {
      const under = over(p[surfaceKey], page)
      const text = over(p[textKey], under)
      expect(
        ratio(text, under),
        `${textKey} on ${surfaceKey}`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('old key blue (borders and icons only) holds 3:1 on the page and on cards', () => {
    for (const surfaceKey of ['bg', 'bgPanel'] as const) {
      const under = over(p[surfaceKey], page)
      expect(ratio(over(p.blue, under), under)).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('palettes', () => {
  it('define the same keys in both themes', () => {
    expect(Object.keys(paperPalette).sort()).toEqual(Object.keys(navyPalette).sort())
  })

  it('give every key a plain colour or a shadow, never an empty value', () => {
    for (const p of [navyPalette, paperPalette]) {
      for (const [key, value] of Object.entries(p)) {
        expect(value, key).toMatch(/\S/)
      }
    }
  })

  it('differ where it matters: Navy is dark, Paper is light', () => {
    expect(luminance(parseColor(navyPalette.bg).slice(0, 3) as unknown as Rgb)).toBeLessThan(0.05)
    expect(luminance(parseColor(paperPalette.bg).slice(0, 3) as unknown as Rgb)).toBeGreaterThan(0.85)
  })

  it('keeps green for running and blue for ours', () => {
    expect(navyPalette.green).toBe(navyPalette.ok)
    expect(navyPalette.accent).toBe(navyPalette.brand)
    expect(navyPalette.ok).not.toBe(navyPalette.accent)
    expect(paperPalette.ok).not.toBe(paperPalette.accent)
  })

  it('tints notice and tag borders from the tone colour, in both themes', () => {
    const pairs = [
      ['okLine', 'ok'],
      ['busyLine', 'busy'],
      ['warnLine', 'warn'],
      ['badLine', 'bad'],
      ['baseLine', 'base'],
    ] as const
    for (const p of [navyPalette, paperPalette]) {
      for (const [line, tone] of pairs) {
        const [r, g, b, a] = parseColor(p[line])
        const [tr, tg, tb] = parseColor(p[tone])
        expect([r, g, b], line).toEqual([tr, tg, tb])
        expect(a, line).toBeGreaterThan(0.25)
        expect(a, line).toBeLessThan(0.5)
      }
    }
  })

  it('paletteFor picks by scheme', () => {
    expect(paletteFor('dark')).toBe(navyPalette)
    expect(paletteFor('light')).toBe(paperPalette)
  })
})

describe('css variables', () => {
  it('names tokens from their key', () => {
    expect(cssVarName('bg')).toBe('--tp-bg')
    expect(cssVarName('surface2')).toBe('--tp-surface-2')
    expect(cssVarName('bgActiveBlue')).toBe('--tp-bg-active-blue')
    expect(cssVarName('railHttps')).toBe('--tp-rail-https')
  })

  it('references a variable with the Navy value as fallback', () => {
    expect(cssVarRef('bg')).toBe('var(--tp-bg, #0b1220)')
  })

  it('web colors are variable references; native colors are Navy values', () => {
    const web = colorTokens(true)
    const native = colorTokens(false)
    expect(native).toBe(navyPalette)
    for (const key of Object.keys(navyPalette) as PaletteKey[]) {
      expect(web[key]).toBe(cssVarRef(key))
    }
  })

  it('themeCss defines every variable for both themes', () => {
    const css = themeCss()
    for (const key of Object.keys(navyPalette) as PaletteKey[]) {
      expect(css).toContain(`${cssVarName(key)}:${navyPalette[key]};`)
      expect(css).toContain(`${cssVarName(key)}:${paperPalette[key]};`)
    }
  })

  it('themeCss: Navy by default, Paper for a light device with no saved choice', () => {
    const css = themeCss()
    expect(css.startsWith(':root{color-scheme:dark;')).toBe(true)
    expect(css).toContain(
      '@media (prefers-color-scheme: light){:root:not([data-theme]){color-scheme:light;',
    )
  })

  it('themeCss: a saved choice or a pinned subtree wins over the device', () => {
    const css = themeCss()
    expect(css).toContain('[data-theme="light"]{color-scheme:light;')
    expect(css).toContain('[data-theme="dark"]{color-scheme:dark;')
    expect(css).toContain('html,body{background-color:var(--tp-bg);}')
  })
})
