// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MANAGED_HAS_BINDINGS_COPY } from '@/lib/user-error'
import { ManagedLifecyclePanel } from './managed-lifecycle-panel'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)

vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/ui', () => ({
  SectionPanel: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  ButtonRow: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  Button: ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress?: () => void }) => (
    <button disabled={disabled} onClick={onPress}>
      {label}
    </button>
  ),
  TextField: ({ placeholder, onChangeText }: { placeholder?: string; onChangeText: (v: string) => void }) => (
    <input placeholder={placeholder} onChange={(e) => onChangeText(e.target.value)} />
  ),
}))

afterEach(cleanup)

describe('managed lifecycle panel destroy refusal', () => {
  it('shows plain words when apps are still connected', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('HTTP 409: managed_has_bindings'))
    render(
      <ManagedLifecyclePanel
        status="ready"
        projectName="shop"
        canManage
        busy={false}
        onLifecycle={vi.fn()}
        onApply={vi.fn()}
        onDelete={onDelete}
      />,
    )
    fireEvent.click(screen.getByText('Delete'))
    fireEvent.change(screen.getByPlaceholderText('shop'), { target: { value: 'shop' } })
    fireEvent.click(screen.getByText('Confirm delete'))
    await waitFor(() => expect(screen.getByText(MANAGED_HAS_BINDINGS_COPY)).toBeTruthy())
    expect(screen.queryByText(/managed_has_bindings/)).toBeNull()
  })
})
