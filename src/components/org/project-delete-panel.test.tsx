// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONFIRM_GUARD_MS } from '@/components/ui/confirm-button'
import type { EnvironmentRecord } from '@/lib/instance-api'
import { MANAGED_DESTROY_COPY, StopStepSection } from './project-delete-panel'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/ui/button', () => ({
  Button: ({ label, onPress }: Readonly<{ label: string; onPress: () => void }>) => (
    <button type="button" onClick={onPress}>
      {label}
    </button>
  ),
}))
vi.mock('@/components/ui', async () => ({
  ConfirmButton: (await import('@/components/ui/confirm-button')).ConfirmButton,
  Button: (await import('@/components/ui/button')).Button,
  LoadingState: () => null,
  TextField: () => null,
}))
vi.mock('@/lib/queries', () => ({}))
vi.mock('@/components/org/delete-plan-list', () => ({ DeletePlanList: () => null }))

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const row = {
  environment: { id: 'env-1', name: 'production' } as EnvironmentRecord,
  activeCount: 1,
  serverId: 'srv-1',
  stopping: false,
  status: null,
  error: null,
}

describe('Destroy database in the project delete panel', () => {
  it('asks a second time before it destroys anything', () => {
    const onStop = vi.fn()
    render(<StopStepSection envRows={[row]} onStop={onStop} copy={MANAGED_DESTROY_COPY} />)
    fireEvent.click(screen.getByText('Destroy database'))
    expect(onStop).not.toHaveBeenCalled()
    expect(screen.getByText(MANAGED_DESTROY_COPY.confirmPrompt)).toBeTruthy()
    vi.setSystemTime(Date.now() + CONFIRM_GUARD_MS)
    fireEvent.click(screen.getByText(MANAGED_DESTROY_COPY.confirmLabel))
    expect(onStop).toHaveBeenCalledWith('env-1')
  })

  it('ignores a confirm press that comes right after the first one', () => {
    const onStop = vi.fn()
    render(<StopStepSection envRows={[row]} onStop={onStop} copy={MANAGED_DESTROY_COPY} />)
    fireEvent.click(screen.getByText('Destroy database'))
    fireEvent.click(screen.getByText(MANAGED_DESTROY_COPY.confirmLabel))
    expect(onStop).not.toHaveBeenCalled()
  })
})
