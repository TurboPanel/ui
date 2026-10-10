// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MANAGED_FAILOVER_UNSUPPORTED_REASON } from '@/lib/managed-releases'
import {
  defaultManagedVersionSelection,
  ManagedVersionPicker,
} from './managed-version-picker'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/ui', () => ({
  SegmentedControl: ({
    options,
    value,
    disabled,
    onChange,
  }: {
    options: readonly { value: string; label: string }[]
    value: string
    disabled?: boolean
    onChange: (value: string) => void
  }) => (
    <div>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  ),
}))

afterEach(cleanup)

describe('defaultManagedVersionSelection', () => {
  it('preselects MariaDB 11.8', () => {
    expect(defaultManagedVersionSelection('mariadb')).toEqual({
      series: '11.8',
      variantId: 'debian',
    })
  })
})

describe('ManagedVersionPicker', () => {
  it('shows the single-server note for 12.3 and not for 11.8', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <ManagedVersionPicker
        engine="mariadb"
        value={{ series: '11.8', variantId: 'debian' }}
        disabled={false}
        onChange={onChange}
      />,
    )
    expect(screen.getByText('11.8 (recommended)')).toBeTruthy()
    expect(screen.queryByText(MANAGED_FAILOVER_UNSUPPORTED_REASON)).toBeNull()

    rerender(
      <ManagedVersionPicker
        engine="mariadb"
        value={{ series: '12.3', variantId: 'debian' }}
        disabled={false}
        onChange={onChange}
      />,
    )
    expect(screen.getByText(MANAGED_FAILOVER_UNSUPPORTED_REASON)).toBeTruthy()

    fireEvent.click(screen.getByText('11.8 (recommended)'))
    expect(onChange).toHaveBeenCalledWith({ series: '11.8', variantId: 'debian' })
  })
})
