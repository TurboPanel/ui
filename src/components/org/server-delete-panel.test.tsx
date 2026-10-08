// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CappedPreviewList, ServerDeletePreview } from '@/lib/instance-api'
import {
  SERVER_DELETE_ENVIRONMENTS_LEAD,
  SERVER_DELETE_FORGET_CONFIRM_LABEL,
  SERVER_DELETE_FORGET_COPY,
  SERVER_DELETE_FORGET_REVEAL_LABEL,
  SERVER_DELETE_MEMBERS_LEAD,
} from '@/lib/server-delete-preview'
import { ServerDeletePanel } from './server-delete-panel'

const { useServerDeletePreview } = vi.hoisted(() => ({
  useServerDeletePreview: vi.fn(),
}))

vi.mock('@/components/org/server-blocker-items', () => ({
  ServerBlockerItemsFromRow: ({
    orgId,
    row,
  }: {
    orgId: string
    row: { items?: unknown; more?: number }
  }) => {
    const items = Array.isArray(row.items) ? row.items : []
    return (
      <>
        {items.map(
          (item: {
            id: string
            name: string
            projectId?: string
            projectName?: string
          }) => (
            <a
              key={item.id}
              href={
                item.projectId
                  ? `/${orgId}/projects/${item.projectId}/environments/${item.id}`
                  : '#'
              }
            >
              {item.projectName ? `${item.projectName} / ${item.name}` : item.name}
            </a>
          )
        )}
      </>
    )
  },
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
    pageCopy: {},
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
  Button: ({
    label,
    onPress,
    disabled,
  }: {
    label: string
    onPress: () => void
    disabled?: boolean
  }) => (
    <button disabled={disabled} onClick={onPress}>
      {label}
    </button>
  ),
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
    environments: emptyList,
    members: emptyList,
    blockedDatabases: emptyList,
    blockedEnvironments: emptyList,
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
        environments: emptyList,
        members: emptyList,
        blockedDatabases: emptyList,
    blockedEnvironments: emptyList,
      }
    )
    expect(screen.queryByText(SERVER_DELETE_FORGET_REVEAL_LABEL)).toBeNull()
    expect(screen.queryByText(SERVER_DELETE_FORGET_CONFIRM_LABEL)).toBeNull()
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
    expect(screen.queryByText(SERVER_DELETE_FORGET_REVEAL_LABEL)).toBeNull()
    expect(screen.queryByText(SERVER_DELETE_FORGET_CONFIRM_LABEL)).toBeNull()
    expect(screen.getByText('Delete server')).toBeTruthy()
  })

  it('lists environments after the first confirm step', () => {
    const onConfirm = vi.fn()
    renderPanel(
      { onConfirm },
      preview({
        environments: capped(
          [
            { id: 'env-1', name: 'staging', projectName: 'Shop' },
            { id: 'env-2', name: 'prod', projectName: 'Blog' },
          ],
          1
        ),
        members: capped([{ id: 'rep-1', databaseName: 'catalog' }]),
      })
    )
    expect(screen.queryByText(new RegExp(SERVER_DELETE_ENVIRONMENTS_LEAD))).toBeNull()
    fireEvent.click(screen.getByText(SERVER_DELETE_FORGET_REVEAL_LABEL))
    expect(
      screen.getByText(
        `${SERVER_DELETE_ENVIRONMENTS_LEAD} staging in Shop, prod in Blog, and 1 more`
      )
    ).toBeTruthy()
    expect(screen.getByText(`${SERVER_DELETE_MEMBERS_LEAD} catalog`)).toBeTruthy()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('performs forget only on the second confirm step', () => {
    const onConfirm = vi.fn()
    renderPanel({ onConfirm, deleteBlocked: true }, preview())
    expect(screen.queryByText(SERVER_DELETE_FORGET_COPY)).toBeNull()
    expect(screen.queryByText(SERVER_DELETE_FORGET_CONFIRM_LABEL)).toBeNull()
    fireEvent.click(screen.getByText(SERVER_DELETE_FORGET_REVEAL_LABEL))
    expect(screen.getByText(SERVER_DELETE_FORGET_COPY)).toBeTruthy()
    expect(screen.getByText('web (running) · shop')).toBeTruthy()
    expect(screen.getByText('api (exited)')).toBeTruthy()
    expect(screen.getByText('and 2 more')).toBeTruthy()
    expect(screen.getByText('project_default')).toBeTruthy()
    expect(screen.getByText('10.0.0.5')).toBeTruthy()
    expect(onConfirm).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText(SERVER_DELETE_FORGET_CONFIRM_LABEL))
    expect(onConfirm).toHaveBeenCalledWith(true)
  })

  it('links environments named on delete blockers', () => {
    renderPanel(
      { serverConnected: true },
      preview({
        online: true,
        canForget: false,
        blockers: [
          {
            kind: 'environment',
            count: 1,
            items: [
              {
                id: 'env-1',
                name: 'staging',
                projectId: 'proj-1',
                projectName: 'Shop',
                hasDatabase: false,
              },
            ],
          },
        ],
      })
    )
    expect(
      screen.getByText('App environment "Shop / staging" is still placed on this server.')
    ).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Shop / staging' })
    expect(link.getAttribute('href')).toBe('/org-1/projects/proj-1/environments/env-1')
  })

  it('shows blocked database refusal text and hides forget', () => {
    const onConfirm = vi.fn()
    renderPanel(
      { onConfirm },
      preview({
        canForget: false,
        blockedDatabases: capped([
          { id: 'db-1', name: 'orders', reason: 'only_member' },
          { id: 'db-2', name: 'analytics', reason: 'primary_here' },
        ]),
      })
    )
    expect(
      screen.getByText(
        'Database "orders" has its only copy on this server. Delete the database first.'
      )
    ).toBeTruthy()
    expect(
      screen.getByText(
        'Database "analytics" has its primary copy on this server. Promote another member or delete the database first.'
      )
    ).toBeTruthy()
    expect(screen.queryByText(SERVER_DELETE_FORGET_REVEAL_LABEL)).toBeNull()
    expect(screen.queryByText(SERVER_DELETE_FORGET_CONFIRM_LABEL)).toBeNull()
    expect(screen.getByText('Delete server')).toBeTruthy()
    expect(onConfirm).not.toHaveBeenCalled()
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
    expect(screen.queryByText(SERVER_DELETE_FORGET_REVEAL_LABEL)).toBeNull()
    expect(screen.queryByText(SERVER_DELETE_FORGET_CONFIRM_LABEL)).toBeNull()
    expect(screen.getByText('Delete server')).toBeTruthy()
  })

  it('disables both confirms while a delete is in flight', () => {
    renderPanel({ deleting: true }, preview())
    const buttons = screen.getAllByRole('button')
    for (const button of buttons) {
      expect(button).toHaveProperty('disabled', true)
    }
  })
})
