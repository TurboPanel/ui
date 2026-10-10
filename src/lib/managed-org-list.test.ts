import { describe, expect, it } from 'vitest'
import type { ManagedListRecord } from '@/lib/managed-services'
import {
  DELETED_PROJECT_LABEL,
  MANAGED_SHARED_LISTENER_PENDING_LABEL,
  managedOrgListProjectEnvironmentLabel,
  managedOrgListServerPresentation,
  managedSharedListenerLabel,
  MANAGED_SHARED_LOOPBACK_HOST,
} from '@/lib/managed-org-list'
import {
  MANAGED_INGRESS_MYSQL_PORT,
  MANAGED_INGRESS_PGSQL_PORT,
} from '@/lib/managed-ingress-ports'

function listRow(
  partial: Partial<ManagedListRecord> & Pick<ManagedListRecord, 'engine'>,
): ManagedListRecord {
  return {
    id: 'mg-1',
    environmentId: 'env-1',
    name: 'db',
    status: 'ready',
    host: MANAGED_SHARED_LOOPBACK_HOST,
    port: 5432,
    serverId: 'srv-1',
    metadata: {},
    options: null,
    createdAt: 't',
    updatedAt: 't',
    engineDisplayName: null,
    environmentName: 'Production',
    projectId: 'proj-1',
    projectName: 'Shop',
    workspaceId: 'ws-1',
    workspaceName: null,
    serverName: 'web-01',
    members: [],
    ...partial,
  }
}

describe('managedSharedListenerLabel', () => {
  it('maps postgres backend port to default ingress', () => {
    expect(managedSharedListenerLabel(listRow({ engine: 'postgres' }))).toBe(
      `${MANAGED_SHARED_LOOPBACK_HOST}:${MANAGED_INGRESS_PGSQL_PORT}`,
    )
  })

  it('maps mysql and mariadb backend ports to the mysql-family ingress', () => {
    expect(
      managedSharedListenerLabel(
        listRow({ engine: 'mysql', port: 3306 }),
      ),
    ).toBe(`${MANAGED_SHARED_LOOPBACK_HOST}:${MANAGED_INGRESS_MYSQL_PORT}`)
    expect(
      managedSharedListenerLabel(
        listRow({ engine: 'mariadb', port: 3306 }),
      ),
    ).toBe(`${MANAGED_SHARED_LOOPBACK_HOST}:${MANAGED_INGRESS_MYSQL_PORT}`)
  })

  it('honors custom org ingress ports', () => {
    expect(
      managedSharedListenerLabel(listRow({ engine: 'postgres', port: 5432 }), {
        postgres: 25432,
        mysqlFamily: 23306,
      }),
    ).toBe(`${MANAGED_SHARED_LOOPBACK_HOST}:25432`)
  })

  it('remaps any stale residual host/port to loopback ingress', () => {
    expect(
      managedSharedListenerLabel(
        listRow({
          engine: 'postgres',
          host: 'postgres.internal',
          port: 5432,
        }),
      ),
    ).toBe(`${MANAGED_SHARED_LOOPBACK_HOST}:${MANAGED_INGRESS_PGSQL_PORT}`)
    expect(
      managedSharedListenerLabel(
        listRow({
          engine: 'mysql',
          host: '127.0.0.1',
          port: 3306,
        }),
      ),
    ).toBe(`${MANAGED_SHARED_LOOPBACK_HOST}:${MANAGED_INGRESS_MYSQL_PORT}`)
  })

  it('keeps an API listener that already carries the ingress port', () => {
    expect(
      managedSharedListenerLabel(
        listRow({
          engine: 'postgres',
          host: MANAGED_SHARED_LOOPBACK_HOST,
          port: MANAGED_INGRESS_PGSQL_PORT,
        }),
      ),
    ).toBe(`${MANAGED_SHARED_LOOPBACK_HOST}:${MANAGED_INGRESS_PGSQL_PORT}`)
  })

  it('returns Not exposed without a placed server', () => {
    expect(
      managedSharedListenerLabel(
        listRow({ engine: 'postgres', serverId: null, host: null, port: null }),
      ),
    ).toBe('Not exposed')
  })

  it('shows a neutral placeholder while ingress ports are still loading', () => {
    expect(
      managedSharedListenerLabel(listRow({ engine: 'postgres' }), null),
    ).toBe(MANAGED_SHARED_LISTENER_PENDING_LABEL)
  })

  it('infers loopback ingress for ready rows before host metadata exists', () => {
    expect(
      managedSharedListenerLabel(
        listRow({
          engine: 'postgres',
          host: null,
          port: null,
          status: 'ready',
        }),
      ),
    ).toBe(`${MANAGED_SHARED_LOOPBACK_HOST}:${MANAGED_INGRESS_PGSQL_PORT}`)
  })
})

/** Shape from `GET /organizations/:id/managed` (`routes.test.ts` in turbopanel). */
const ORG_MANAGED_LIST_API_ROW = {
  id: '55555555-5555-4555-8555-555555555555',
  engine: 'postgres' as const,
  engineDisplayName: 'PostgreSQL',
  name: 'PostgreSQL',
  projectId: '44444444-4444-4444-8444-444444444444',
  projectName: 'Shop',
  environmentId: '33333333-3333-4333-8333-333333333333',
  environmentName: 'Production',
  serverId: '66666666-6666-4666-8666-666666666666',
  serverName: 'host-1',
  status: 'ready' as const,
  host: '127.0.0.1',
  port: 15432,
  createdAt: '2026-03-01T00:00:00.000Z',
  members: [] as const,
}

describe('organization managed list wire labels', () => {
  it('renders project, environment, and server from API field names', () => {
    expect(
      managedOrgListProjectEnvironmentLabel(ORG_MANAGED_LIST_API_ROW),
    ).toBe('Shop / Production')
    expect(managedOrgListServerPresentation(ORG_MANAGED_LIST_API_ROW)).toEqual({
      display: 'host-1',
      accessibilityLabel:
        'host-1 (66666666-6666-4666-8666-666666666666)',
    })
    expect(
      managedSharedListenerLabel(
        { ...ORG_MANAGED_LIST_API_ROW, engine: 'postgres' },
        { postgres: 15432, mysqlFamily: 13306 },
      ),
    ).toBe('127.0.0.1:15432')
  })

  it('still accepts legacy *DisplayName keys from older control planes', () => {
    expect(
      managedOrgListProjectEnvironmentLabel({
        projectId: ORG_MANAGED_LIST_API_ROW.projectId,
        projectDisplayName: 'Shop',
        environmentDisplayName: 'Production',
      }),
    ).toBe('Shop / Production')
    expect(
      managedOrgListServerPresentation({
        serverId: ORG_MANAGED_LIST_API_ROW.serverId,
        serverDisplayName: 'host-1',
      }),
    ).toEqual({
      display: 'host-1',
      accessibilityLabel:
        'host-1 (66666666-6666-4666-8666-666666666666)',
    })
  })
})

describe('managedOrgListProjectEnvironmentLabel', () => {
  it('shows project and environment names', () => {
    expect(
      managedOrgListProjectEnvironmentLabel({
        projectId: 'p1',
        projectName: 'Shop',
        environmentName: 'Staging',
      }),
    ).toBe('Shop / Staging')
  })

  it('uses deleted project when the name is missing', () => {
    expect(
      managedOrgListProjectEnvironmentLabel({
        projectId: 'p1',
        projectName: null,
        environmentName: 'Production',
      }),
    ).toBe(`${DELETED_PROJECT_LABEL} / Production`)
  })

  it('omits the environment segment when the name is blank', () => {
    expect(
      managedOrgListProjectEnvironmentLabel({
        projectId: 'p1',
        projectName: 'Shop',
        environmentName: '   ',
      }),
    ).toBe('Shop')
  })
})

describe('managedOrgListServerPresentation', () => {
  it('prefers the server display name and keeps the id for accessibility', () => {
    expect(
      managedOrgListServerPresentation({
        serverName: 'Huey',
        serverId: '01a11bde-0000-4000-8000-000000000001',
      }),
    ).toEqual({
      display: 'Huey',
      accessibilityLabel: 'Huey (01a11bde-0000-4000-8000-000000000001)',
    })
  })

  it('falls back to the raw id when no name is present', () => {
    const id = '01a11bde-0000-4000-8000-000000000099'
    expect(
      managedOrgListServerPresentation({ serverName: null, serverId: id }),
    ).toEqual({ display: id, accessibilityLabel: id })
  })

  it('shows an em dash when neither name nor id exists', () => {
    expect(
      managedOrgListServerPresentation({ serverName: null, serverId: null }),
    ).toEqual({ display: '—', accessibilityLabel: 'No server' })
  })
})
