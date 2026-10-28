// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ControlPlaneRecoveryBlock } from './control-plane-recovery-block'

const { setStringAsync } = vi.hoisted(() => ({
  setStringAsync: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('expo-clipboard', () => ({ setStringAsync }))
vi.mock('@/components/ui', async () => ({
  CopyButton: (await import('@/components/ui/copy-button')).CopyButton,
}))

const RECOVERY = {
  runId: 'run-42',
  backupPath: '/var/backups/turbopanel/pre-upgrade-run-42.dump',
  rollbackCommand: 'sudo turbopanel-recover turbopanel_upgrade_id=run-42',
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ControlPlaneRecoveryBlock', () => {
  it('shows the backup and the rollback command for the waiting run', () => {
    render(<ControlPlaneRecoveryBlock recovery={RECOVERY} />)
    expect(screen.getByText('Backup and Rollback')).toBeTruthy()
    expect(screen.getByText(RECOVERY.backupPath)).toBeTruthy()
    expect(screen.getByText(RECOVERY.rollbackCommand)).toBeTruthy()
    expect(screen.getByText(/names update run run-42/)).toBeTruthy()
  })

  it('copies the rollback command and the backup path', async () => {
    render(<ControlPlaneRecoveryBlock recovery={RECOVERY} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy Rollback Command' }))
    expect(setStringAsync).toHaveBeenCalledWith(RECOVERY.rollbackCommand)
    await waitFor(() => {
      expect(screen.getByText('Copied')).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Copy Backup Path' }))
    expect(setStringAsync).toHaveBeenLastCalledWith(RECOVERY.backupPath)
  })

  it('offers no copy for a command that does not name a run yet', () => {
    render(
      <ControlPlaneRecoveryBlock
        recovery={{ ...RECOVERY, rollbackCommand: 'sudo turbopanel-recover <upgrade id>' }}
      />
    )
    expect(screen.queryByRole('button', { name: 'Copy Rollback Command' })).toBeNull()
    expect(screen.getByText(/not ready to copy/)).toBeTruthy()
  })

  it('shows nothing when no control plane install waits', () => {
    const { container } = render(<ControlPlaneRecoveryBlock recovery={null} />)
    expect(container.textContent).toBe('')
  })
})
