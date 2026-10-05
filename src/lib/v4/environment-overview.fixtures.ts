/** A small environment (Staging) with every kind of station, for the Overview tests. */

import type {
  BindingRecord,
  ContainerRecord,
  HostingRecord,
  ProjectPrincipalRecord,
  ServiceRecord,
  StorageRecord,
  TlsRecord,
} from '@/lib/instance-api'
import type {
  ConfigViewChange,
  ConfigViewFieldRow,
  ConfigViewService,
  EnvironmentConfigView,
} from '@/lib/v4/config-view-client'
import type { OverviewSource } from './environment-overview'

export function row(
  service: string,
  field: string,
  value: string | null,
  extra: Partial<ConfigViewFieldRow> = {},
): ConfigViewFieldRow {
  return {
    key: `svc:${service}:${field}`,
    area: field === 'linuxUser' ? 'linuxUser' : 'service',
    field,
    label: field,
    value,
    masked: value === null,
    source: 'base',
    ...extra,
  }
}

export function viewService(
  name: string,
  kind: ConfigViewService['kind'],
  rows: ConfigViewFieldRow[] = [],
  extra: Partial<ConfigViewService> = {},
): ConfigViewService {
  return { name, serviceId: `s-${name}`, kind, source: 'base', rows, ...extra }
}

const web = viewService('web', 'node', [
  row('web', 'linuxUser', 'website', { source: 'environment' }),
  row('web', 'domain:shop.example.com', 'shop.example.com', { area: 'domain' }),
  row('web', 'depends_on', 'redis, missing'),
])
const blog = viewService('blog', 'site', [row('blog', 'depends_on', 'web')])
const api = viewService('api', 'container', [
  row('api', 'image', 'ghcr.io/acme/api:1'),
  row('api', 'depends_on.redis.condition', 'service_started'),
])
const redis = viewService('redis', 'container', [row('redis', 'image', 'redis:8')])
const old = viewService('old', 'container', [row('old', 'image', 'nginx:1')], { serviceId: null })

export const CHANGES: readonly ConfigViewChange[] = [
  {
    key: 'svc:web:command',
    area: 'service',
    label: 'Start command',
    field: 'command',
    serviceName: 'web',
    serviceId: 's-web',
    kind: 'changed',
    baseValue: 'node a.js',
    baseSource: 'base',
    envValue: 'node b.js',
    envSource: 'environment',
    masked: false,
  },
  {
    key: 'svc:old',
    area: 'service',
    label: 'old',
    field: null,
    serviceName: 'old',
    serviceId: null,
    kind: 'removed',
    baseValue: null,
    baseSource: 'base',
    envValue: null,
    envSource: null,
    masked: false,
  },
  {
    key: 'var:API_URL',
    area: 'variable',
    label: 'API_URL',
    field: null,
    serviceName: null,
    serviceId: null,
    kind: 'added',
    baseValue: null,
    baseSource: null,
    envValue: 'https://x',
    envSource: 'environment',
    masked: false,
  },
  {
    key: 'var:TOKEN',
    area: 'variable',
    label: 'TOKEN',
    field: null,
    serviceName: null,
    serviceId: null,
    kind: 'changed',
    baseValue: null,
    baseSource: 'project',
    envValue: null,
    envSource: 'environment',
    masked: true,
  },
]

export function configView(overrides: Partial<EnvironmentConfigView> = {}): EnvironmentConfigView {
  return {
    ok: true,
    environmentId: 'env-1',
    projectId: 'p1',
    followsBase: true,
    base: {
      services: [viewService('web', 'node', [row('web', 'linuxUser', 'website')]), old],
      variables: [],
      linuxUsers: [{ name: 'website', access: 'sftp', description: null, source: 'base', usedBy: ['web'] }],
    },
    effective: {
      services: [web, blog, api, redis],
      variables: [],
      linuxUsers: [
        { name: 'website', access: 'sftp', description: null, source: 'base', usedBy: ['web'] },
        { name: 'blogger', access: 'none', description: null, source: 'base', usedBy: [] },
      ],
    },
    changes: CHANGES,
    ...overrides,
  }
}

export function serviceRecord(name: string): ServiceRecord {
  return {
    id: `s-${name}`,
    name,
    description: null,
    environmentId: 'env-1',
    composeServiceName: name,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  }
}

export function container(name: string, status: string, role: ContainerRecord['role'] = 'service'): ContainerRecord {
  return {
    id: `c-${name}-${status}-${role}`,
    serviceId: `s-${name}`,
    environmentId: 'env-1',
    serverId: 'srv',
    containerId: 'abc',
    containerName: name,
    status,
    role,
    composeServiceName: name,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  }
}

export function hosting(name: string | null, tlsId: string | null = null): HostingRecord {
  return {
    id: `h-${name}`,
    name,
    description: null,
    serviceId: 's-web',
    tlsId,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  }
}

export function tlsRecord(
  id: string,
  source: TlsRecord['source'],
  status: TlsRecord['metadata']['status'],
): TlsRecord {
  return {
    id,
    organizationId: 'org-1',
    name: null,
    source,
    metadata: {
      dnsNames: [],
      hasWildcard: false,
      notBefore: '',
      notAfter: '',
      fingerprintSha256: '',
      subject: '',
      issuer: '',
      status,
    },
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  }
}

export function storageRecord(name: string, mountService: string | null): StorageRecord {
  return {
    id: `st-${name}`,
    organizationId: 'org-1',
    workspaceId: null,
    projectId: null,
    environmentId: 'env-1',
    serviceId: null,
    kind: 'volume',
    name,
    accessMode: 'single_writer',
    retention: 'retain',
    generation: 1,
    principalId: null,
    metadata: null,
    options: null,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    copies: [],
    mounts:
      mountService === null
        ? []
        : [
            {
              id: 'm1',
              storageId: `st-${name}`,
              serviceId: mountService,
              destinationPath: '/app/uploads',
              subpath: null,
              readOnly: false,
              metadata: null,
              options: null,
              createdAt: '2026-10-01T00:00:00Z',
              updatedAt: '2026-10-01T00:00:00Z',
            },
          ],
  }
}

export function binding(
  serviceId: string,
  databaseName: string,
  managedId: string | null,
  engine: BindingRecord['engine'],
): BindingRecord {
  return {
    id: `b-${serviceId}-${databaseName}`,
    principalId: 'pr',
    serviceId,
    databaseName,
    keyPrefix: '',
    emitEngineDefaults: true,
    keys: [],
    endpoint: null,
    engine,
    managedId,
    managedEnvironmentId: managedId,
    readSplit: null,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  }
}

export function principal(username: string, serviceIds: string[]): ProjectPrincipalRecord {
  return { id: `pr-${username}`, username, serviceIds } as unknown as ProjectPrincipalRecord
}

export function overviewSource(overrides: Partial<OverviewSource> = {}): OverviewSource {
  return {
    envName: 'Staging',
    view: configView(),
    services: ['web', 'blog', 'api', 'redis'].map(serviceRecord),
    containers: [
      container('web', 'running'),
      container('web', 'running', 'ingress'),
      container('blog', 'restarting'),
      container('redis', 'exited'),
    ],
    hostings: { 's-web': [hosting('shop.example.com', 't1'), hosting('shop.example.com', 't1'), hosting(' ')] },
    tls: [tlsRecord('t1', 'lets_encrypt', 'ready')],
    storage: [storageRecord('uploads', 's-web'), storageRecord('empty', null)],
    bindings: [
      binding('s-web', 'shopdb', 'm1', 'postgres'),
      binding('s-api', 'shopdb', 'm1', 'postgres'),
      binding('s-web', 'plain', null, null),
      binding('s-ghost', 'ghostdb', 'm2', 'weird' as never),
    ],
    principals: [principal('blogger', ['s-blog'])],
    ...overrides,
  }
}
