// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ServerServicesRecord } from '@/lib/instance-api'
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

function emptyRecord(overrides: Partial<ServerServicesRecord> = {}): ServerServicesRecord {
  return {
    serverId: 'srv-1',
    removal: { canRemove: true, reasons: [] },
    apps: [],
    databases: [],
    databaseUsers: [],
    backups: [],
    networks: [],
    ipCount: 0,
    hostServices: [],
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
    expect(screen.getByText(SERVER_SERVICES_EMPTY.hostServices)).toBeTruthy()
    expect(screen.getByText(SERVER_SERVICES_EMPTY.runtimes)).toBeTruthy()
  })

  it('lists blockers when the server cannot be removed', () => {
    state.result = {
      isLoading: false,
      error: null,
      data: emptyRecord({
        removal: {
          canRemove: false,
          reasons: [
            {
              kind: 'container',
              count: 2,
              message: '2 containers still run here: stop or move the apps first',
            },
          ],
        },
      }),
    }
    render(<ServerServicesSection orgId="org-1" serverId="srv-1" />)
    expect(screen.getAllByText(SERVER_CAN_REMOVE_NO_TITLE).length).toBeGreaterThan(0)
    expect(
      screen.getByText('2 containers still run here: stop or move the apps first')
    ).toBeTruthy()
  })

  it('renders attached inventory without vendor names', () => {
    state.result = {
      isLoading: false,
      error: null,
      data: emptyRecord({
        ipCount: 2,
        apps: [
          {
            serviceId: 'svc-1',
            name: 'shop',
            project: 'Store',
            environment: 'Live',
            domains: ['shop.example.com'],
            containers: [{ name: 'shop-1', status: 'running', role: 'service' }],
          },
        ],
        databases: [
          {
            managedId: 'db-1',
            name: 'orders',
            engine: 'postgres',
            role: 'primary',
            status: 'running',
            readEligible: true,
            ordinal: 1,
          },
        ],
        databaseUsers: [
          {
            serviceId: 'svc-1',
            serviceName: 'shop',
            databaseName: 'orders',
            databaseServiceName: 'db',
          },
        ],
        backups: [
          {
            managedId: 'db-1',
            managedName: 'orders copies',
            count: 1,
            latestAt: null,
          },
        ],
        networks: [{ id: 'net-1', name: 'apps', kind: 'docker' }],
        hostServices: [{ key: 'proxysql', label: 'ProxySQL', state: 'up' }],
        runtimes: [{ kind: 'php', versions: ['8.3'] }],
      }),
    }
    render(<ServerServicesSection orgId="org-1" serverId="srv-1" />)
    expect(screen.getAllByText('shop').length).toBeGreaterThan(0)
    expect(screen.getByText('Store · Live')).toBeTruthy()
    expect(screen.getByText('shop.example.com')).toBeTruthy()
    expect(screen.getByText('orders')).toBeTruthy()
    expect(screen.getByText('PostgreSQL')).toBeTruthy()
    expect(screen.getByText('Takes reads')).toBeTruthy()
    expect(screen.getByText('Uses orders (db)')).toBeTruthy()
    expect(screen.getByText(/1 copy/)).toBeTruthy()
    expect(screen.getByText('apps')).toBeTruthy()
    expect(screen.getByText('Apps network')).toBeTruthy()
    expect(screen.getByText('2 addresses on this server')).toBeTruthy()
    expect(screen.getByText('Database connector')).toBeTruthy()
    expect(screen.queryByText(/ProxySQL/i)).toBeNull()
    expect(screen.getByText('PHP')).toBeTruthy()
    expect(screen.getByText('8.3')).toBeTruthy()
  })
})
