// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PanelKeyLines } from './panel-key-lines'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui', () => ({
  FingerprintLine: ({ label, value }: { label: string; value: string }) => (
    <p>
      <b>{label}</b>
      <span>{value}</span>
    </p>
  ),
}))
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: { muted: {} } }))

const CURRENT = 'C'.repeat(43)
const NEXT = 'N'.repeat(43)

describe('PanelKeyLines', () => {
  afterEach(cleanup)

  it('shows the key a command carries, and the next key when one is set', () => {
    render(<PanelKeyLines panelFingerprint={CURRENT} nextFingerprint={NEXT} />)
    expect(screen.getByText(CURRENT)).toBeTruthy()
    expect(screen.getByText(NEXT)).toBeTruthy()
    expect(screen.getByText(/do not run the command/)).toBeTruthy()
  })

  it('leaves out the next key when there is none', () => {
    render(<PanelKeyLines panelFingerprint={CURRENT} nextFingerprint={null} />)
    expect(screen.queryByText('Next Key')).toBeNull()
  })

  it('renders nothing when the control plane sent no key', () => {
    const { container } = render(<PanelKeyLines />)
    expect(container.textContent).toBe('')
  })
})
