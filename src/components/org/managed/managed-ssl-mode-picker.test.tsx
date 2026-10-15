// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MANAGED_SSL_EXTERNAL_ACCESS_REASON } from '@/lib/managed-ssl'
import { ManagedSslModePicker } from './managed-ssl-mode-picker'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))

afterEach(cleanup)

function rowDisabled(label: string): boolean {
  return (screen.getByRole('radio', { name: label }) as HTMLButtonElement).disabled
}

describe('ManagedSslModePicker', () => {
  it('offers every mode when external access is off', () => {
    render(
      <ManagedSslModePicker
        value={null}
        inheritLabel="Organization default (Prefer)"
        inheritMode="prefer"
        disabled={false}
        onSelect={() => {}}
      />,
    )
    for (const label of ['Organization default (Prefer)', 'Disable', 'Allow', 'Prefer', 'Require']) {
      expect(rowDisabled(label)).toBe(false)
    }
    expect(screen.queryByText(MANAGED_SSL_EXTERNAL_ACCESS_REASON)).toBeNull()
  })

  it('disables the modes without SSL, and an inherit row that resolves to one, with the reason', () => {
    render(
      <ManagedSslModePicker
        value="require"
        inheritLabel="Organization default (Allow)"
        inheritMode="allow"
        weakModesDisabledReason={MANAGED_SSL_EXTERNAL_ACCESS_REASON}
        disabled={false}
        onSelect={() => {}}
      />,
    )
    for (const label of ['Organization default (Allow)', 'Disable', 'Allow', 'Prefer']) {
      expect(rowDisabled(label)).toBe(true)
    }
    for (const label of ['Require', 'Verify CA', 'Verify Full']) {
      expect(rowDisabled(label)).toBe(false)
    }
    expect(screen.getAllByText(MANAGED_SSL_EXTERNAL_ACCESS_REASON)).toHaveLength(4)
  })

  it('keeps an inherit row that resolves to Require available under external access', () => {
    render(
      <ManagedSslModePicker
        value={null}
        inheritLabel="Organization default (Require)"
        inheritMode="require"
        weakModesDisabledReason={MANAGED_SSL_EXTERNAL_ACCESS_REASON}
        disabled={false}
        onSelect={() => {}}
      />,
    )
    expect(rowDisabled('Organization default (Require)')).toBe(false)
  })
})
