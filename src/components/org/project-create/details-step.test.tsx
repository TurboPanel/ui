// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EnvironmentNameField } from './details-step'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('expo-router', () => ({
  Link: ({ children }: { children?: unknown }) => <>{children as never}</>,
}))
vi.mock('@/components/ui', () => ({
  EmptyState: () => null,
  FormField: () => null,
  LoadingState: () => null,
  SegmentedControl: () => null,
  TextField: ({
    accessibilityLabel,
    value,
    placeholder,
    adornment,
    onChangeText,
  }: {
    accessibilityLabel: string
    value: string
    placeholder?: string
    adornment?: unknown
    onChangeText: (value: string) => void
  }) => (
    <div>
      <input
        aria-label={accessibilityLabel}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChangeText(event.target.value)}
      />
      {adornment as never}
    </div>
  ),
}))

afterEach(cleanup)

function field(value: string, defaultName: string | null, onChange = vi.fn()) {
  return render(
    <EnvironmentNameField
      orgId="org-1"
      value={value}
      defaultName={defaultName}
      onChange={onChange}
    />
  )
}

describe('EnvironmentNameField', () => {
  it('shows the pill while the value equals the default', () => {
    field('Staging', 'Staging')
    expect(screen.getByText('Organization Default')).toBeTruthy()
  })

  it('drops the pill once the value differs from the default', () => {
    field('Edge', 'Staging')
    expect(screen.queryByText('Organization Default')).toBeNull()
  })

  it('follows a late-loading default: no pill, then pill when it resolves', () => {
    const view = field('', null)
    expect(screen.queryByText('Organization Default')).toBeNull()
    view.rerender(
      <EnvironmentNameField
        orgId="org-1"
        value="Staging"
        defaultName="Staging"
        onChange={vi.fn()}
      />
    )
    expect(screen.getByText('Organization Default')).toBeTruthy()
  })

  it('shows an empty placeholder and no pill when the default cannot be read', () => {
    field('', null)
    const input = screen.getByLabelText('Environment name') as HTMLInputElement
    expect(input.value).toBe('')
    expect(input.placeholder).toBe('Organization default')
    expect(screen.queryByText('Organization Default')).toBeNull()
  })

  it('reports what the user types', () => {
    const onChange = vi.fn()
    field('', null, onChange)
    fireEvent.change(screen.getByLabelText('Environment name'), {
      target: { value: 'Edge' },
    })
    expect(onChange).toHaveBeenCalledWith('Edge')
  })
})
