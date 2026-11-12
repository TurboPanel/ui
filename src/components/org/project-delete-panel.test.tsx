// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EnvironmentRecord } from '@/lib/instance-api'
import { MANAGED_DESTROY_COPY, StopStepSection } from './project-delete-panel'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/ui/button', () => ({
  Button: ({
    label,
    onPress,
    disabled,
  }: Readonly<{ label: string; onPress: () => void; disabled?: boolean }>) => (
    <button type="button" disabled={disabled} onClick={onPress}>
      {label}
    </button>
  ),
  ButtonRow: ({ children }: Readonly<{ children: unknown }>) => <div>{children as never}</div>,
}))
vi.mock('@/components/ui/modal-sheet', () => ({
  ModalSheet: ({
    title,
    description,
    children,
    footer,
  }: Readonly<{ title: string; description?: string; children: unknown; footer: unknown }>) => (
    <div role="dialog">
      <h1>{title}</h1>
      <p>{description}</p>
      {children as never}
      {footer as never}
    </div>
  ),
}))
vi.mock('@/components/ui/form-field', () => ({
  TextField: ({
    label,
    value,
    onChangeText,
  }: Readonly<{ label: string; value: string; onChangeText: (v: string) => void }>) => (
    <input aria-label={label} value={value} onChange={(e) => onChangeText(e.target.value)} />
  ),
}))
vi.mock('@/components/ui/copy-button', () => ({
  CopyButton: () => <button type="button">Copy</button>,
}))
vi.mock('@/components/ui/mono-text', () => ({
  MonoText: ({ children }: Readonly<{ children: string }>) => <code>{children}</code>,
}))
vi.mock('@/components/ui', async () => ({
  ...(await import('@/components/ui/type-name-confirm')),
  Button: (await import('@/components/ui/button')).Button,
  LoadingState: () => null,
}))
vi.mock('@/lib/queries', () => ({}))
vi.mock('@/components/org/delete-plan-list', () => ({ DeletePlanList: () => null }))

afterEach(cleanup)

const row = {
  environment: { id: 'env-1', name: 'production' } as EnvironmentRecord,
  activeCount: 1,
  serverId: 'srv-1',
  stopping: false,
  status: null,
  error: null,
}

describe('Destroy database in the project delete panel', () => {
  it('asks for the project name before it destroys anything', () => {
    const onStop = vi.fn()
    render(
      <StopStepSection
        envRows={[row]}
        onStop={onStop}
        copy={MANAGED_DESTROY_COPY}
        confirmName="Shop"
      />
    )
    fireEvent.click(screen.getByText('Destroy Database', { selector: 'button' }))
    expect(onStop).not.toHaveBeenCalled()
    expect(screen.getByRole('heading').textContent).toBe('Destroy Database')
    expect(
      screen.getByText(`${MANAGED_DESTROY_COPY.confirmPrompt} Type the project name to confirm.`)
    ).toBeTruthy()
    expect(screen.getByText('Copy')).toBeTruthy()

    const confirm = within(screen.getByRole('dialog')).getByText('Destroy Database', {
      selector: 'button',
    }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Database name'), { target: { value: 'shop' } })
    expect(confirm.disabled).toBe(true)
    fireEvent.click(confirm)
    expect(onStop).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Database name'), { target: { value: 'Shop' } })
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)
    expect(onStop).toHaveBeenCalledWith('env-1', 'Shop')
  })
})
