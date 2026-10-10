// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TeeStripe } from '@/components/ui/v4/tee-stripe'
import { styleOf } from '@/components/ui/v4/rn-stub'
import { navyPalette, paperPalette } from '@/lib/theme-palettes'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('expo-linear-gradient', async () => (await import('@/components/ui/v4/rn-stub')).linearGradientStub)

afterEach(cleanup)

describe('TeeStripe', () => {
  it('is a 3 px rounded bar from brand blue to brand green', () => {
    const { container } = render(<TeeStripe />)
    const stripe = container.firstElementChild
    expect(stripe?.getAttribute('data-gradient')).toBe('#3366cc,#3dd68c')
    expect(styleOf(stripe).height).toBe(3)
    expect(styleOf(stripe).borderRadius).toBe(999)
  })

  it('paints the same two colours in both themes', () => {
    const { container } = render(<TeeStripe />)
    const [from, to] = (container.firstElementChild?.getAttribute('data-gradient') ?? '').split(',')
    for (const p of [navyPalette, paperPalette]) {
      expect(from).toBe(p.brand)
      expect(to).toBe(p.brand2)
    }
  })
})
