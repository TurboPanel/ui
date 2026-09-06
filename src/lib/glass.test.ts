import { afterEach, describe, expect, it, vi } from 'vitest'
import { glass, glassSurfaceStyle } from '@/lib/glass'

const platform = vi.hoisted(() => ({ OS: 'web' as string }))

vi.mock('react-native', () => ({
  Platform: platform,
}))

afterEach(() => {
  platform.OS = 'web'
})

describe('glassSurfaceStyle', () => {
  it('uses regular fill and blur on web by default', () => {
    const style = glassSurfaceStyle()
    expect(style.backgroundColor).toBe(glass.fill)
    expect(style.borderColor).toBe(glass.border)
    expect(
      (style as { backdropFilter?: string }).backdropFilter,
    ).toBe(`blur(${glass.blurPx}px) saturate(${glass.saturatePct}%)`)
    expect((style as { boxShadow?: string }).boxShadow).toBe(glass.shadow)
  })

  it('softens fill and blur for the soft intensity', () => {
    const style = glassSurfaceStyle('soft')
    expect(style.backgroundColor).toBe(glass.fillSoft)
    expect((style as { backdropFilter?: string }).backdropFilter).toContain(
      'blur(12px)',
    )
  })

  it('densifies fill and blur for the strong intensity', () => {
    const style = glassSurfaceStyle('strong')
    expect(style.backgroundColor).toBe(glass.fillStrong)
    expect((style as { backdropFilter?: string }).backdropFilter).toContain(
      'blur(20px)',
    )
  })

  it('omits web-only backdrop tokens on native', () => {
    platform.OS = 'ios'
    const style = glassSurfaceStyle('regular')
    expect(style).toEqual({
      backgroundColor: glass.fill,
      borderColor: glass.border,
    })
  })
})
