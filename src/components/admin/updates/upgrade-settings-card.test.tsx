// @vitest-environment happy-dom
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { UpgradeSettings } from '@/lib/instance-api'
import { UpgradeSettingsCard } from './upgrade-settings-card'

type MockProps = {
  label?: string
  title?: string
  value?: boolean
  disabled?: boolean
  onValueChange?: (value: boolean) => void
  children?: ReactNode
}

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui', () => ({
  SectionPanel: (props: MockProps) => <section>{props.children}</section>,
  SegmentedControl: () => <div />,
  SettingRow: (props: MockProps) => (
    <div data-testid={props.label}>
      <span>{props.label}</span>
      {props.children}
    </div>
  ),
  TextField: () => <input />,
  Toggle: (props: MockProps) => (
    <button
      type="button"
      disabled={Boolean(props.disabled)}
      onClick={() => props.onValueChange?.(!props.value)}
    />
  ),
}))
vi.mock('@/components/ui/v4/action-button', () => ({
  ActionButton: (props: { label?: string; disabled?: boolean; onPress?: () => void }) => (
    <button type="button" disabled={Boolean(props.disabled)} onClick={() => props.onPress?.()}>
      {props.label}
    </button>
  ),
}))

const SAVED: UpgradeSettings = {
  autoUpdate: false,
  batch: { mode: 'percent', value: 10 },
  maintenanceWindow: { enabled: true, startMinute: 1080, durationMinutes: 60, weekdays: [1, 3] },
}

afterEach(cleanup)

describe('UpgradeSettingsCard', () => {
  it('saves the whole settings object when the auto-update toggle changes', () => {
    const onSave = vi.fn()
    render(<UpgradeSettingsCard settings={SAVED} loading={false} saving={false} onSave={onSave} />)
    fireEvent.click(within(screen.getByTestId('Auto-update servers')).getByRole('button'))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith({ ...SAVED, autoUpdate: true })
  })

  it('does not save when the saved settings failed to load', () => {
    const onSave = vi.fn()
    render(<UpgradeSettingsCard settings={null} loading={false} saving={false} onSave={onSave} />)
    const toggle = within(screen.getByTestId('Auto-update servers')).getByRole('button')
    expect((toggle as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(toggle)
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText(/Settings could not be loaded/)).toBeTruthy()
  })

  it('disables Apply until saved settings have loaded', () => {
    const onSave = vi.fn()
    const { rerender } = render(
      <UpgradeSettingsCard settings={null} loading={false} saving={false} onSave={onSave} />
    )
    const apply = within(screen.getByTestId('Save batch size')).getByRole('button')
    expect((apply as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(apply)
    expect(onSave).not.toHaveBeenCalled()

    rerender(
      <UpgradeSettingsCard settings={SAVED} loading={false} saving={false} onSave={onSave} />
    )
    const applySaved = within(screen.getByTestId('Save batch size')).getByRole('button')
    expect((applySaved as HTMLButtonElement).disabled).toBe(false)
  })

  it('hides the toggle when hideAutoUpdate is set', () => {
    render(
      <UpgradeSettingsCard
        settings={SAVED}
        loading={false}
        saving={false}
        hideAutoUpdate
        onSave={vi.fn()}
      />
    )
    expect(screen.queryByTestId('Auto-update servers')).toBeNull()
  })
})
