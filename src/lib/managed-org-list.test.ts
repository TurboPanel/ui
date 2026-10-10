import { describe, expect, it } from 'vitest'
import type { ManagedListRecord } from '@/lib/managed-services'
import {
  DELETED_PROJECT_LABEL,
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
