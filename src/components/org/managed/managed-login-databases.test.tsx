// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/ui', () => ({
  SettingRow: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  Toggle: ({
    value,
    disabled,
    onValueChange,
    accessibilityLabel,
  }: {
    value: boolean
    disabled?: boolean
    onValueChange: (next: boolean) => void
    accessibilityLabel?: string
  }) => (
    <button
      role="switch"
      aria-checked={value}
      aria-label={accessibilityLabel}
      disabled={disabled}
      onClick={() => onValueChange(!value)}
    >
      x
    </button>
  ),
}))

import type { ManagedUserRecord } from '@/lib/managed-services'
import {
  AllDatabasesChip,
  allDatabasesOffReason,
  allDatabasesOffSwitch,
  LoginAllDatabasesEditor,
} from './managed-login-databases'

afterEach(cleanup)

describe('AllDatabasesChip', () => {
  it('toggles and explains itself only while on', () => {
    const onToggle = vi.fn()
    const { rerender } = render(
      <AllDatabasesChip selected={false} onToggle={onToggle} disabled={false} />
    )
    expect(screen.queryByText(/including ones added later/)).toBeNull()
    fireEvent.click(screen.getByLabelText('All Databases'))
    expect(onToggle).toHaveBeenCalledTimes(1)
    rerender(<AllDatabasesChip selected onToggle={onToggle} disabled={false} />)
    expect(screen.getByText(/including ones added later/)).toBeTruthy()
  })
})

describe('All Databases switches', () => {
  it('names the switch that is off and disables the chip', () => {
    const onToggle = vi.fn()
    render(
      <AllDatabasesChip
        selected={false}
        onToggle={onToggle}
        disabled={false}
        offReason={allDatabasesOffReason('cluster')}
      />
    )
    expect(
      screen.getByText('All Databases is switched off for this Database Cluster.')
    ).toBeTruthy()
    fireEvent.click(screen.getByLabelText('All Databases'))
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('reports the organization switch first and nothing for an older control plane', () => {
    expect(allDatabasesOffSwitch({ organization: false, cluster: false })).toBe('organization')
    expect(allDatabasesOffSwitch({ organization: true, cluster: false })).toBe('cluster')
    expect(allDatabasesOffSwitch({ organization: true, cluster: true })).toBeNull()
    expect(allDatabasesOffSwitch(undefined)).toBeNull()
    expect(allDatabasesOffReason('organization')).toBe(
      'All Databases is switched off for this organization.'
    )
    expect(allDatabasesOffReason(null)).toBeNull()
  })
})

const loginRow = (allDatabases: boolean) =>
  ({
    id: 'l1',
    username: 'reader',
    allDatabases,
    databases: ['app'],
  }) as unknown as ManagedUserRecord

describe('LoginAllDatabasesEditor', () => {
  it('patches allDatabases for an existing login', async () => {
    const onUpdate = vi.fn(async () => ({ ok: true as const }))
    render(
      <LoginAllDatabasesEditor
        user={loginRow(false)}
        disabled={false}
        off={null}
        onUpdate={onUpdate}
        onError={vi.fn()}
      />
    )
    fireEvent.click(screen.getByLabelText('All Databases: reader'))
    expect(onUpdate).toHaveBeenCalledWith('l1', { allDatabases: true })
  })

  it('cannot turn on while a switch is off, but can turn an existing one off', () => {
    const props = { disabled: false, off: 'cluster' as const, onUpdate: vi.fn(), onError: vi.fn() }
    const { rerender } = render(<LoginAllDatabasesEditor user={loginRow(false)} {...props} />)
    expect((screen.getByLabelText('All Databases: reader') as HTMLButtonElement).disabled).toBe(
      true
    )
    expect(
      screen.getByText('All Databases is switched off for this Database Cluster.')
    ).toBeTruthy()
    rerender(<LoginAllDatabasesEditor user={loginRow(true)} {...props} />)
    expect((screen.getByLabelText('All Databases: reader') as HTMLButtonElement).disabled).toBe(
      false
    )
  })
})
