// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PanelKeyBadge } from './panel-key-badge'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui', () => ({
  Badge: ({ label, tone }: { label: string; tone: string }) => (
    <span data-tone={tone}>{label}</span>
  ),
}))
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: { muted: {} } }))

describe('PanelKeyBadge', () => {
  afterEach(cleanup)

  it.each([
    ['install', 'Pinned at Install'],
    ['upgrade', 'Pinned on Upgrade'],
    ['unsafe', 'No Control Plane Key'],
  ] as const)('shows %s as %s', (pinnedBy, label) => {
    render(<PanelKeyBadge pinnedBy={pinnedBy} />)
    expect(screen.getByText(label)).toBeTruthy()
  })

  it('explains a server installed without a key when asked', () => {
    render(<PanelKeyBadge pinnedBy="unsafe" withHelp />)
    expect(screen.getByText(/Reinstall it with a fresh command/)).toBeTruthy()
  })

  it('shows nothing when no pin is recorded', () => {
    const { container } = render(<PanelKeyBadge pinnedBy="none" withHelp />)
    expect(container.textContent).toBe('')
  })
})
