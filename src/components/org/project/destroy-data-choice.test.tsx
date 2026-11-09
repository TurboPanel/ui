// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DestroyDataChoice } from '@/components/org/project/destroy-data-choice'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui', () => ({
  Checkbox: ({ label, onPress }: Readonly<{ label: string; onPress: () => void }>) => (
    <button type="button" onClick={onPress}>
      {label}
    </button>
  ),
  MonoText: ({ children }: Readonly<{ children: React.ReactNode }>) => <span>{children}</span>,
  TextField: ({
    label,
    value,
    onChangeText,
  }: Readonly<{ label: string; value: string; onChangeText: (value: string) => void }>) => (
    <input aria-label={label} value={value} onChange={(e) => onChangeText(e.target.value)} />
  ),
}))

afterEach(() => cleanup())

const data = {
  volumes: [{ storageId: 'a', name: 'db_data' }],
  kept: [
    {
      storageId: 'b',
      name: 'shared_files',
      reason: 'shared' as const,
      message: 'Another environment uses this volume too.',
    },
  ],
  outdatedServers: [],
}

function renderChoice(overrides: Partial<Parameters<typeof DestroyDataChoice>[0]> = {}) {
  const props = {
    checked: true,
    onToggle: vi.fn(),
    typedName: '',
    onTypedName: vi.fn(),
    expectedName: 'staging',
    data,
    loading: false,
    error: null,
    disabled: false,
    ...overrides,
  }
  render(<DestroyDataChoice {...props} />)
  return props
}

describe('DestroyDataChoice', () => {
  it('shows only the checkbox while unticked', () => {
    const props = renderChoice({ checked: false })
    fireEvent.click(screen.getByText('Also Delete the Data Volumes'))
    expect(props.onToggle).toHaveBeenCalled()
    expect(screen.queryByText('db_data')).toBeNull()
    expect(screen.queryByLabelText('Environment Name')).toBeNull()
  })

  it('lists what goes and what stays, and asks for the name', () => {
    const props = renderChoice()
    expect(screen.getByText('db_data')).toBeTruthy()
    expect(screen.getByText('shared_files')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Environment Name'), { target: { value: 'staging' } })
    expect(props.onTypedName).toHaveBeenCalledWith('staging')
  })

  it('names the servers that need a daemon update', () => {
    renderChoice({ data: { ...data, outdatedServers: [{ serverId: 's', name: 'web-1' }] } })
    expect(
      screen.getByText('Update the daemon on web-1 before deleting data volumes.')
    ).toBeTruthy()
  })

  it('says when there is nothing to delete', () => {
    renderChoice({ data: { volumes: [], kept: [], outdatedServers: [] } })
    expect(screen.getByText('This environment has no data volumes to delete.')).toBeTruthy()
  })
})
