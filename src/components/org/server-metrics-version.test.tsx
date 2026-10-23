// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ServerMetricsVersion } from './server-metrics-version'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)

describe('ServerMetricsVersion', () => {
  afterEach(cleanup)

  it('shows the layout number the panel sent', () => {
    render(<ServerMetricsVersion version={12} />)
    expect(screen.getByText('Server Metrics Version 12')).toBeTruthy()
  })

  it('renders nothing when the panel did not send it', () => {
    const { container } = render(<ServerMetricsVersion version={undefined} />)
    expect(container.textContent).toBe('')
  })
})
