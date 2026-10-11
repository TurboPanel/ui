// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CappedPreviewList, ServerServicesRecord } from '@/lib/instance-api'
import {
  SERVER_CAN_REMOVE_NO_TITLE,
  SERVER_CAN_REMOVE_YES_TITLE,
  SERVER_SERVICES_EMPTY,
} from '@/lib/server-services'
import { ServerServicesSection } from './server-services-section'

const state = vi.hoisted(() => ({
  result: {
    isLoading: false,
    error: null as Error | null,
    data: undefined as ServerServicesRecord | undefined,
  },
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui/panel-styles', () => ({
  panelStyles: { muted: {}, pageCopy: {} },
}))
vi.mock('@/components/ui', () => ({
  Badge: ({ label }: { label: string }) => <span>{label}</span>,
  EmptyState: ({ title }: { title: string }) => <p>{title}</p>,
  InlineNotice: ({ title, body }: { title: string; body?: string }) => (
    <div>
      <strong>{title}</strong>
      {body ? <span>{body}</span> : null}
    </div>
  ),
  LoadingState: ({ label }: { label?: string }) => <div role="progressbar">{label}</div>,
  SectionPanel: ({
    title,
    hint,
    children,
  }: {
    title?: string
    hint?: string
    children?: unknown
  }) => (
    <section>
      {title ? <h2>{title}</h2> : null}
      {hint ? <p>{hint}</p> : null}
      {children as never}
    </section>
  ),
}))
vi.mock('@/lib/queries/servers', () => ({
  useServerServices: () => state.result,
}))

function capped<T>(items: T[], more = 0): CappedPreviewList<T> {
  return { items, more }
}

function emptyRecord(overrides: Partial<ServerServicesRecord> = {}): ServerServicesRecord {
  return {
    serverId: 'srv-1',
    removal: { canRemove: true, online: true, canForget: false, reasons: [] },
    apps: capped([]),
    databases: [],
    databaseUsers: capped([]),
    backups: capped([]),
    networks: capped([]),
    ipCount: 0,
    runtimes: [],
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  state.result = { isLoading: false, error: null, data: undefined }
})

describe('ServerServicesSection', () => {
  it('shows loading', () => {
    state.result = { isLoading: true, error: null, data: undefined }
    render(<ServerServicesSection orgId="org-1" serverId="srv-1" />)
    expect(screen.getByRole('progressbar').textContent).toMatch(/Loading/)
  })

  it('shows an error', () => {
    state.result = {
      isLoading: false,
      error: new Error('HTTP 500: boom'),
      data: undefined,
    }
    render(<ServerServicesSection orgId="org-1" serverId="srv-1" />)
    expect(screen.getByText('Could not load what runs on this server')).toBeTruthy()
  })

  it('shows a quiet line when the query has no payload', () => {
    render(<ServerServicesSection orgId="org-1" serverId="srv-1" />)
    expect(screen.getByText('Nothing to show for this server yet.')).toBeTruthy()
  })

  it('shows quiet empty lines when nothing is attached and the server can be removed', () => {
    state.result = { isLoading: false, error: null, data: emptyRecord() }
    render(<ServerServicesSection orgId="org-1" serverId="srv-1" />)
    expect(screen.getAllByText(SERVER_CAN_REMOVE_YES_TITLE).length).toBeGreaterThan(0)
    expect(screen.getByText(SERVER_SERVICES_EMPTY.apps)).toBeTruthy()
    expect(screen.getByText(SERVER_SERVICES_EMPTY.databases)).toBeTruthy()
    expect(screen.getByText(SERVER_SERVICES_EMPTY.databaseUsers)).toBeTruthy()
    expect(screen.getByText(SERVER_SERVICES_EMPTY.backups)).toBeTruthy()
    expect(screen.getByText(SERVER_SERVICES_EMPTY.networks)).toBeTruthy()
    expect(screen.getByText(SERVER_SERVICES_EMPTY.runtimes)).toBeTruthy()
    expect(screen.queryByText('Host services')).toBeNull()
  })

  it('lists blockers when the server cannot be removed', () => {
    state.result = {
      isLoading: false,
      error: null,
      data: emptyRecord({
        removal: {
          canRemove: false,
          online: true,
          canForget: false,
          reasons: [
            {
              kind: 'container',
              count: 2,
              message: '2 containers are still on this server: stop or move the apps first.',
            },
          ],
        },
      }),
    }
    render(<ServerServicesSection orgId="org-1" serverId="srv-1" />)
    expect(screen.getAllByText(SERVER_CAN_REMOVE_NO_TITLE).length).toBeGreaterThan(0)
    expect(
      screen.getByText('2 containers are still on this server: stop or move the apps first.')
    ).toBeTruthy()
    expect(screen.getByText(/Clear the items below first/)).toBeTruthy()
  })

  it('names the control-panel host and skips clear-first copy', () => {
    state.result = {
      isLoading: false,
      error: null,
      data: emptyRecord({
        removal: {
          canRemove: false,
          online: true,
          canForget: false,
          reasons: [
            {
              kind: 'colocated',
              count: 1,
              message:
                'This is the machine running the control panel itself and cannot be removed.',
            },
          ],
        },
      }),
    }
    render(<ServerServicesSection orgId="org-1" serverId="srv-1" />)
    expect(
      screen.getAllByText(
        'This is the machine running the control panel itself and cannot be removed.'
      ).length
    ).toBeGreaterThan(0)
    expect(screen.queryByText(/Clear the items below first/)).toBeNull()
  })

  it('points an offline forgettable host at Delete server → Host is gone', () => {
    state.result = {
      isLoading: false,
      error: null,
      data: emptyRecord({
        removal: {
          canRemove: false,
          online: false,
          canForget: true,
          reasons: [
            {
              kind: 'container',
              count: 1,
              message:
                'One container is still recorded on this server. Because the host is offline, you can remove it with Delete server → Host is gone.',
            },
          ],
        },
      }),
    }
    render(<ServerServicesSection orgId="org-1" serverId="srv-1" />)
    expect(screen.getAllByText(/Delete server → Host is gone/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Clear the items below first/)).toBeNull()
  })

  it('renders attached inventory, grouped database users, caps, and lsphp/compose labels', () => {
    state.result = {
      isLoading: false,
      error: null,
      data: emptyRecord({
        ipCount: 2,
        apps: capped(
          [
            {
              serviceId: 'svc-1',
              name: 'shop',
              project: 'Store',
              environment: 'Live',
              domains: capped(['shop.example.com'], 7),
              containers: capped([{ name: 'shop-1', status: 'running', role: 'service' }], 2),
            },
          ],
          3
        ),
        databases: [
          {
            managedId: 'db-1',
            name: 'orders',
            engine: 'postgres',
            role: 'primary',
            status: 'ready',
            readEligible: true,
            ordinal: 1,
          },
          {
            managedId: 'db-1',
            name: 'orders',
            engine: 'postgres',
            role: 'replica',
            status: 'needs_resync',
            readEligible: false,
            ordinal: 2,
          },
        ],
        databaseUsers: capped(
          [
            {
              serviceId: 'svc-1',
              serviceName: 'shop',
              databases: ['catalog', 'orders'],
            },
          ],
          4
        ),
        backups: capped(
          [
            {
              managedId: 'db-1',
              managedName: 'orders copies',
              count: 1,
              latestAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          6
        ),
        networks: capped([{ id: 'net-1', name: 'apps', kind: 'compose' }], 5),
        runtimes: [{ kind: 'lsphp', versions: ['8.3'] }],
      }),
    }
    render(<ServerServicesSection orgId="org-1" serverId="srv-1" />)
    expect(screen.getAllByText('shop').length).toBeGreaterThan(0)
    expect(screen.getByText('Store · Live')).toBeTruthy()
    expect(screen.getByText('shop.example.com')).toBeTruthy()
    expect(screen.getAllByText('orders').length).toBeGreaterThan(0)
    expect(screen.getAllByText('PostgreSQL')).toHaveLength(2)
    expect(screen.getByText('Takes reads')).toBeTruthy()
    expect(screen.getByText('Needs a resync')).toBeTruthy()
    expect(screen.getByText('Uses catalog, orders')).toBeTruthy()
    expect(screen.getByText(/1 copy/)).toBeTruthy()
    expect(screen.getByText('apps')).toBeTruthy()
    expect(screen.getByText('App network (Compose)')).toBeTruthy()
    expect(screen.getByText('2 addresses on this server')).toBeTruthy()
    expect(screen.getByText('LiteSpeed PHP')).toBeTruthy()
    expect(screen.getByText('8.3')).toBeTruthy()
    expect(screen.getByText('and 3 more')).toBeTruthy()
    expect(screen.getByText('and 2 more')).toBeTruthy()
    expect(screen.getByText('and 7 more')).toBeTruthy()
    expect(screen.getByText('and 4 more')).toBeTruthy()
    expect(screen.getByText('and 5 more')).toBeTruthy()
    expect(screen.getByText('and 6 more')).toBeTruthy()
  })
})
