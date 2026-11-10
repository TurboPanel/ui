// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KeyRotationState, RotationPasskey } from '@/lib/instance-api'
import { KeyRotationPanel } from './key-rotation-panel'

const { useKeyRotation, cancelRun } = vi.hoisted(() => ({
  useKeyRotation: vi.fn(),
  cancelRun: vi.fn(),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/lib/queries/admin', () => ({
  useKeyRotation,
  usePrepareKeysetStatement: () => ({ run: vi.fn(), isPending: false }),
  useApproveKeysetStatement: () => ({ run: vi.fn(), isPending: false }),
  useCancelWaitingKeyChange: () => ({ run: cancelRun, isPending: false }),
}))
// The real components are React Native; only their text and presses matter here.
vi.mock('@/components/ui', () => ({
  Badge: ({ label }: { label: string }) => <span>{label}</span>,
  Button: ({ label, onPress }: { label: string; onPress?: () => void }) => (
    <button type="button" onClick={onPress}>
      {label}
    </button>
  ),
  ButtonRow: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ConfirmButton: ({
    label,
    prompt,
    onConfirm,
  }: {
    label: string
    prompt?: string
    onConfirm: () => void
  }) => (
    <button type="button" title={prompt} onClick={onConfirm}>
      {label}
    </button>
  ),
  InlineNotice: ({ title, body }: { title: string; body?: string }) => (
    <p>
      {title}: {body}
    </p>
  ),
  LoadingState: () => <span>Loading</span>,
  SectionPanel: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}))
vi.mock('@/components/ui/fingerprint-line', () => ({
  FingerprintLine: ({ label, value }: { label: string; value?: string | null }) => (
    <p>
      {label}: {value || 'Not set'}
    </p>
  ),
}))

const passkey = (over: Partial<RotationPasskey>): RotationPasskey => ({
  passkeyId: 'pk-1',
  name: 'Security Key',
  ownerEmail: 'root@example.com',
  isOwn: true,
  isDeviceBound: true,
  canApprove: true,
  isMarked: true,
  rotationId: 'rot-1',
  ...over,
})

function show(over: Partial<KeyRotationState>) {
  const state: KeyRotationState = {
    ok: true,
    runtime: 'workers',
    rpId: 'cp.example.com',
    keyset: 3,
    fingerprint: 'C'.repeat(43),
    markedCount: 2,
    canRotate: true,
    hasDeviceBound: true,
    passkeys: [],
    awaitingKey: null,
    statements: [],
    ...over,
  }
  useKeyRotation.mockReturnValue({
    data: state,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })
  render(<KeyRotationPanel />)
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('KeyRotationPanel', () => {
  it('offers Unmark while another marked passkey stays, never on the last one', () => {
    const two = [passkey({}), passkey({ passkeyId: 'pk-2', rotationId: 'rot-2', name: 'Phone' })]
    show({ passkeys: two, markedCount: 2 })
    expect(screen.getAllByText('Unmark')).toHaveLength(2)
    cleanup()
    show({ passkeys: [passkey({})], markedCount: 1 })
    expect(screen.queryByText('Unmark')).toBeNull()
    expect(screen.getByText('Rotation')).toBeTruthy()
  })

  it('shows no waiting change and no cancel when nothing waits', () => {
    show({})
    expect(screen.queryByText('Cancel Waiting Change')).toBeNull()
    expect(screen.getByText('Approves On: cp.example.com')).toBeTruthy()
  })

  it('a waiting change can be cancelled, with a plain warning first', async () => {
    cancelRun.mockResolvedValue({ ok: true, value: { ok: true, keyset: 4, cancelled: true } })
    show({ canRotate: false, awaitingKey: { keyset: 4, newFingerprint: 'N'.repeat(43) } })
    expect(screen.getByText(/Key Change Waiting: Key set 4 is approved/)).toBeTruthy()
    expect(screen.getByText(`New Key: ${'N'.repeat(43)}`)).toBeTruthy()
    const cancel = screen.getByText('Cancel Waiting Change')
    expect(cancel.getAttribute('title')).toMatch(/Cancel only if the rotation command stopped/)
    fireEvent.click(cancel)
    expect(cancelRun).toHaveBeenCalledWith(4)
    await waitFor(() =>
      expect(
        screen.getByText('Key set 4 was cancelled. Nothing changed on any server.')
      ).toBeTruthy()
    )
  })

  it('says so beside the control when the cancel is refused', async () => {
    cancelRun.mockResolvedValue({
      ok: false,
      error: 'This change is already in use by servers and cannot be cancelled.',
    })
    show({ canRotate: false, awaitingKey: { keyset: 4, newFingerprint: 'N'.repeat(43) } })
    fireEvent.click(screen.getByText('Cancel Waiting Change'))
    await waitFor(() =>
      expect(
        screen.getByText('This change is already in use by servers and cannot be cancelled.')
      ).toBeTruthy()
    )
  })
})
