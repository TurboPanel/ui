// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ServerDeletePreview } from '@/lib/instance-api'
import { SERVER_DELETE_FORGET_COPY } from '@/lib/server-delete-preview'
import { ServerDeletePanel } from './server-delete-panel'

const { useServerDeletePreview } = vi.hoisted(() => ({
  useServerDeletePreview: vi.fn(),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)

vi.mock('@/lib/queries/servers', () => ({
  useServerDeletePreview,
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
})

function preview(patch: Partial<ServerDeletePreview> = {}): ServerDeletePreview {
  return {
    online: false,
    canForget: true,
    colocated: false,
    blockers: [{ kind: 'container', count: 2 }],
    containers: [
      { id: 'c1', name: 'web', status: 'running', serviceName: 'shop' },
      { id: 'c2', name: 'api', status: 'exited' },
    ],
    networks: [{ id: 'n1', name: 'project_default' }],
    ips: [{ id: 'i1', address: '10.0.0.5' }],
    more: { containers: 2, networks: 0, ips: 0 },
    ...patch,
  }
}

function renderPanel(
  props: Partial<{
    serverConnected: boolean
    deleting: boolean
    deleteError: string | null
    deleteBlocked: boolean
    onConfirm: (forgetResources: boolean) => void
  }> = {},
  data: ServerDeletePreview | undefined = undefined
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
  it('keeps the online path to the blockers message only', () => {
    renderPanel(
      {
        serverConnected: true,
        deleteError: 'Remove 2 containers on this server before deleting it.',
        deleteBlocked: true,
      },
      preview({ online: true, canForget: false })
    )
    expect(screen.getByText('Remove 2 containers on this server before deleting it.')).toBeTruthy()
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
    expect(onConfirm).toHaveBeenCalledWith(true)
  })

  it('disables both confirms while a delete is in flight', () => {
    renderPanel({ deleting: true }, preview())
    const buttons = screen.getAllByRole('button')
    for (const button of buttons) {
      expect(button).toHaveProperty('disabled', true)
    }
  })
})
