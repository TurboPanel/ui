// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HighAvailabilityWordmark } from '@/components/brand/high-availability-wordmark'

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }))

vi.mock('@/lib/auth-context', () => ({ useAuth }))
vi.mock('@/lib/queries/system', () => ({ useControlPlaneHealth: () => ({ data: undefined }) }))
vi.mock('@/lib/theme-preference', () => ({
  useColors: () => ({ brand: '#00f', link: '#08f' }),
  useColorScheme: () => 'light',
}))
vi.mock('@/components/brand/build-info-sheet', () => ({ BuildInfoSheet: () => null }))
// The real components are React Native; plain elements keep the style prop.
vi.mock('react-native', () => {
  const flat = (style: unknown): Record<string, unknown> =>
    Array.isArray(style) ? Object.assign({}, ...style.map(flat)) : ((style as Record<string, unknown> | undefined) ?? {})
  const box = ({ children, style }: { children?: React.ReactNode; style?: unknown }) => (
    <div style={flat(style)}>{children}</div>
  )
  return {
    View: box,
    Text: box,
    Pressable: box,
    Linking: {},
    Platform: { OS: 'web', select: (o: Record<string, unknown>) => o.web ?? o.default },
    StyleSheet: { create: (styles: unknown) => styles },
  }
})
vi.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children, style }: { children: React.ReactNode; style?: unknown }) => (
    <div style={Object.assign({}, ...[style].flat(3).filter(Boolean))}>{children}</div>
  ),
}))

describe('HighAvailabilityWordmark', () => {
  afterEach(cleanup)

  it('renders nothing while the runtime is unknown, so a caller keeps no empty box', () => {
    useAuth.mockReturnValue({ controlPlaneRuntime: null })
    const { container } = render(<HighAvailabilityWordmark style={{ top: 2 }} />)
    expect(container.innerHTML).toBe('')
  })

  it('applies the caller style to its own root on the hosted control plane', () => {
    useAuth.mockReturnValue({ controlPlaneRuntime: 'workers' })
    const { container } = render(<HighAvailabilityWordmark style={{ top: 2 }} />)
    expect(container.innerHTML).toContain('top: 2px')
  })
})
