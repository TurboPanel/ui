// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, env, SCENARIOS } from '@/components/ui/v4/rn-stub'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { colors } from '@/lib/theme'
import { navyPalette, paperPalette } from '@/lib/theme-palettes'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)

afterEach(cleanup)

function Probe({ onPalette }: Readonly<{ onPalette: (p: ReturnType<typeof usePalette>) => void }>) {
  onPalette(usePalette())
  return <span>probe</span>
}

describe('usePalette', () => {
  beforeEach(() => applyScenario(SCENARIOS[0]))

  it('gives the web the CSS variable references, so a theme change needs no render', () => {
    const seen = vi.fn()
    render(<Probe onPalette={seen} />)
    expect(seen).toHaveBeenCalledWith(colors)
    expect(seen.mock.calls[0][0].surface).toMatch(/^var\(--tp-surface, /)
  })

  it('gives a phone the real values of the scheme being painted', () => {
    const seen = vi.fn()
    env.os = 'ios'
    env.scheme = 'dark'
    render(<Probe onPalette={seen} />)
    expect(seen).toHaveBeenLastCalledWith(navyPalette)
    cleanup()
    env.scheme = 'light'
    render(<Probe onPalette={seen} />)
    expect(seen).toHaveBeenLastCalledWith(paperPalette)
  })
})

describe('themedStyles', () => {
  it('builds a sheet once per palette and reuses it', () => {
    const factory = vi.fn((p: typeof navyPalette) => ({ box: { backgroundColor: p.surface } }))
    const styles = themedStyles(factory)
    expect(styles(navyPalette)).toBe(styles(navyPalette))
    expect(factory).toHaveBeenCalledTimes(1)
    expect(styles(paperPalette).box.backgroundColor).toBe(paperPalette.surface)
    expect(styles(paperPalette)).not.toBe(styles(navyPalette))
    expect(factory).toHaveBeenCalledTimes(2)
  })

  it('renders through a component', () => {
    render(<Probe onPalette={() => undefined} />)
    expect(screen.getByText('probe')).toBeTruthy()
  })
})
