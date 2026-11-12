// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/ui', () => ({
  Button: ({ label, onPress }: { label: string; onPress?: () => void }) => (
    <button onClick={onPress}>{label}</button>
  ),
  ButtonRow: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  SettingRow: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  Toggle: ({
    value,
    onValueChange,
    accessibilityLabel,
  }: {
    value: boolean
    onValueChange: (next: boolean) => void
    accessibilityLabel?: string
  }) => (
    <button
      role="switch"
      aria-checked={value}
      aria-label={accessibilityLabel}
      onClick={() => onValueChange(!value)}
    >
      x
    </button>
  ),
}))

import { ALL_DATABASES_OFF_CONFIRM, AllDatabasesSwitch } from './all-databases-switch'

afterEach(cleanup)

describe('AllDatabasesSwitch', () => {
  it('turns on at once', () => {
    const onChange = vi.fn()
    render(<AllDatabasesSwitch value={false} onChange={onChange} disabled={false} hint="h" />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('asks before turning off, and Cancel changes nothing', () => {
    const onChange = vi.fn()
    render(<AllDatabasesSwitch value onChange={onChange} disabled={false} hint="h" />)
    fireEvent.click(screen.getByRole('switch'))
    expect(screen.getByText(ALL_DATABASES_OFF_CONFIRM)).toBeTruthy()
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Cancel'))
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('switch'))
    fireEvent.click(screen.getByText('Turn Off'))
    expect(onChange).toHaveBeenCalledWith(false)
  })
})
