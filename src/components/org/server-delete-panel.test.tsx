// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CappedPreviewList, ServerDeletePreview } from '@/lib/instance-api'
import { SERVER_DELETE_FORGET_COPY } from '@/lib/server-delete-preview'
import { ServerDeletePanel } from './server-delete-panel'

const { useServerDeletePreview, useServerPrincipalRemovalPlan } = vi.hoisted(() => ({
  useServerDeletePreview: vi.fn(),
  useServerPrincipalRemovalPlan: vi.fn(
    (): { data: unknown; isLoading: boolean; error: unknown } => ({
      data: undefined,
      isLoading: false,
      error: null,
    })
  ),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)

vi.mock('@/lib/queries/servers', () => ({
  useServerDeletePreview,
  useServerPrincipalRemovalPlan,
}))

// The per-principal list has its own tests; here it is a button per principal
// that flips that principal to "delete outright".
vi.mock('@/components/org/server-removal-principals', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./server-removal-principals')>()),
  ServerRemovalPrincipals: ({
    plan,
    error,
    onChange,
  }: {
    error?: unknown
    plan?: { principalId: string; appliedUsername: string }[]
    onChange: (principalId: string, action: 'keep' | 'delete') => void
  }) => (
    <div>
      {error ? <span>plan error</span> : null}
      {(plan ?? []).map((entry) => (
        <button key={entry.principalId} onClick={() => onChange(entry.principalId, 'delete')}>
          {`delete ${entry.appliedUsername}`}
        </button>
      ))}
    </div>
  ),
}))

vi.mock('@/components/ui/panel-styles', () => ({
  panelStyles: {
    error: {},
    detailTitle: {},
    muted: {},
  },
}))

vi.mock('@/components/ui', () => ({
  InlineNotice: ({ title, body }: { title: string; body?: string }) => (
    <div>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  ),
  MonoText: ({ children }: { children?: unknown }) => <code>{children as never}</code>,
  ConfirmButton: ({
    label,
    confirmLabel,
    onConfirm,
    disabled,
  }: {
    label: string
    confirmLabel?: string
    onConfirm: () => void
    disabled?: boolean
  }) => (
    <div>
      <button disabled={disabled} onClick={onConfirm}>
        {label}
      </button>
      <span>{confirmLabel}</span>
    </div>
  ),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  useServerPrincipalRemovalPlan.mockReturnValue({ data: undefined, isLoading: false, error: null })
})

const emptyList: CappedPreviewList<never> = { items: [], more: 0 }

function capped<T>(items: T[], more = 0): CappedPreviewList<T> {
  return { items, more }
}

function preview(patch: Partial<ServerDeletePreview> = {}): ServerDeletePreview {
  return {
    online: false,
    canForget: true,
    colocated: false,
    blockers: [{ kind: 'container', count: 2 }],
    containers: capped(
      [
        { id: 'c1', name: 'web', status: 'running', serviceName: 'shop' },
        { id: 'c2', name: 'api', status: 'exited' },
      ],
      2
    ),
    networks: capped([{ id: 'n1', name: 'project_default' }]),
    ips: capped([{ id: 'i1', address: '10.0.0.5' }]),
    ...patch,
  }
}

function renderPanel(
  props: Partial<{
    serverConnected: boolean
    deleting: boolean
    deleteError: string | null
    deleteBlocked: boolean
    onConfirm: (forgetResources: boolean, principals: unknown[]) => void
  }> = {},
  data: unknown = undefined
) {
  useServerDeletePreview.mockReturnValue({ data })
  return render(
    <ServerDeletePanel
      orgId="org-1"
      serverId="srv-1"
      serverConnected={false}
      deleting={false}
      deleteError={null}
      deleteBlocked={false}
      onConfirm={vi.fn()}
      {...props}
    />
  )
}

describe('ServerDeletePanel', () => {
  it('keeps an online host with no leftovers on the plain delete button', () => {
    renderPanel(
      { serverConnected: true },
      {
        online: true,
        canForget: false,
        colocated: false,
        blockers: [],
        containers: emptyList,
        networks: emptyList,
        ips: emptyList,
      }
    )
    expect(screen.queryByText('Host is gone')).toBeNull()
    expect(screen.queryByText('Forget these and delete server')).toBeNull()
    expect(screen.getByText('Delete server')).toBeTruthy()
  })

  it('shows blockers and hides forget when canForget is false', () => {
    renderPanel(
      { serverConnected: true },
      preview({
        online: true,
        canForget: false,
        blockers: [
          { kind: 'container', count: 2 },
          { kind: 'database_member', count: 1 },
        ],
      })
    )
    expect(screen.getByText('Remove 2 containers on this server before deleting it.')).toBeTruthy()
    expect(
      screen.getByText('1 other item still placed on this server — remove them first')
    ).toBeTruthy()
    expect(screen.queryByText('Host is gone')).toBeNull()
    expect(screen.queryByText('Forget these and delete server')).toBeNull()
    expect(screen.getByText('Delete server')).toBeTruthy()
  })

  it('lists records to forget when the preview says canForget', () => {
    const onConfirm = vi.fn()
    renderPanel({ onConfirm, deleteBlocked: true }, preview())
    expect(screen.getByText('Host is gone')).toBeTruthy()
    expect(screen.getByText(SERVER_DELETE_FORGET_COPY)).toBeTruthy()
    expect(screen.getByText('web (running) · shop')).toBeTruthy()
    expect(screen.getByText('api (exited)')).toBeTruthy()
    expect(screen.getByText('and 2 more')).toBeTruthy()
    expect(screen.getByText('project_default')).toBeTruthy()
    expect(screen.getByText('10.0.0.5')).toBeTruthy()
    expect(screen.getByText('Forget these and delete server')).toBeTruthy()
    expect(screen.getByText('Confirm forget and delete')).toBeTruthy()
    fireEvent.click(screen.getByText('Forget these and delete server'))
    expect(onConfirm).toHaveBeenCalledWith(true, [])
  })

  it('falls back to the plain delete panel on a malformed preview', () => {
    expect(() =>
      renderPanel(
        {},
        {
          online: false,
          canForget: true,
          colocated: false,
          blockers: [{ kind: 'container', count: 1 }],
          containers: [{ id: 'c1', name: 'web', status: 'running' }],
          networks: [],
          ips: [],
          more: { containers: 1, networks: 0, ips: 0 },
        }
      )
    ).not.toThrow()
    expect(screen.queryByText('Host is gone')).toBeNull()
    expect(screen.queryByText('Forget these and delete server')).toBeNull()
    expect(screen.getByText('Delete server')).toBeTruthy()
  })

  it('disables both confirms while a delete is in flight', () => {
    renderPanel({ deleting: true }, preview())
    const buttons = screen.getAllByRole('button')
    for (const button of buttons) {
      expect(button).toHaveProperty('disabled', true)
    }
  })

  it('sends no principal choices by default, so every principal is kept', () => {
    const onConfirm = vi.fn()
    useServerPrincipalRemovalPlan.mockReturnValue({
      data: { principals: [{ principalId: 'p1', appliedUsername: 'alice_x', canDeleteOutright: true }] },
      isLoading: false,
      error: null,
    })
    renderPanel({ onConfirm }, preview({ canForget: false }))
    fireEvent.click(screen.getByText('Delete server'))
    expect(onConfirm).toHaveBeenCalledWith(false, [])
  })

  it('hides the removal plan instead of erroring when the person may not see it', () => {
    useServerPrincipalRemovalPlan.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('GET /servers/s1/principal-removal-plan failed: HTTP 403'),
    })
    renderPanel({}, preview({ canForget: false }))
    expect(screen.queryByText('plan error')).toBeNull()
    useServerPrincipalRemovalPlan.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('boom'),
    })
    renderPanel({}, preview({ canForget: false }))
    expect(screen.getByText('plan error')).toBeTruthy()
  })

  it('sends the principals chosen for outright deletion', () => {
    const onConfirm = vi.fn()
    useServerPrincipalRemovalPlan.mockReturnValue({
      data: { principals: [{ principalId: 'p1', appliedUsername: 'alice_x', canDeleteOutright: true }] },
      isLoading: false,
      error: null,
    })
    renderPanel({ onConfirm }, preview({ canForget: false }))
    fireEvent.click(screen.getByText('delete alice_x'))
    fireEvent.click(screen.getByText('Delete server'))
    expect(onConfirm).toHaveBeenCalledWith(false, [{ principalId: 'p1', action: 'delete' }])
  })
})
