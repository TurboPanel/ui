/**
 * A config-view answer shaped like the control plane's, for the Configuration
 * tab tests: a "Staging" environment that follows the Base and changes the
 * web app's start command, its Linux user, one variable, and adds a worker.
 */

import type {
  ConfigViewChange,
  ConfigViewFieldRow,
  ConfigViewService,
  ConfigViewVariable,
  EnvironmentConfigViewResponse,
} from '@/lib/instance-api'

export function fieldRow(
  serviceName: string,
  field: string,
  value: string | null,
  extra: Partial<ConfigViewFieldRow> = {}
): ConfigViewFieldRow {
  const area = field === 'linuxUser' ? 'linuxUser' : 'service'
  return {
    key: `svc:${serviceName}:${field}`,
    area,
    field,
    label: field === 'linuxUser' ? 'Linux user' : field,
    value,
    masked: false,
    source: 'base',
    ...extra,
  }
}

export function service(
  name: string,
  kind: ConfigViewService['kind'],
  rows: ConfigViewFieldRow[],
  extra: Partial<ConfigViewService> = {}
): ConfigViewService {
  return { name, serviceId: `id-${name}`, kind, source: 'base', rows, ...extra }
}

export function variable(
  name: string,
  value: string | null,
  extra: Partial<ConfigViewVariable> = {}
): ConfigViewVariable {
  return {
    key: `var:${name}`,
    name,
    variableId: `var-${name}`,
    value,
    isSecret: false,
    forBuild: false,
    forRuntime: true,
    source: 'project',
    ...extra,
  }
}

export function domainRow(
  serviceName: string,
  host: string,
  extra: Partial<ConfigViewFieldRow> = {}
): ConfigViewFieldRow {
  return {
    key: `svc:${serviceName}:domain:${host}`,
    area: 'domain',
    field: `domain:${host}`,
    label: 'Domain',
    value: host,
    masked: false,
    source: 'base',
    ...extra,
  }
}

const baseWeb = service('web', 'node', [
  fieldRow('web', 'command', 'npm start'),
  fieldRow('web', 'linuxUser', 'website'),
  domainRow('web', 'shop.example.com'),
])

const baseUsers = [
  { name: 'website', access: 'sftp' as const, description: null, source: 'base' as const, usedBy: ['web'] },
  { name: 'staging-web', access: 'none' as const, description: null, source: 'base' as const, usedBy: [] },
]

export const STAGING_CHANGES: ConfigViewChange[] = [
  {
    key: 'svc:web:command',
    area: 'service',
    label: 'Start command',
    field: 'command',
    serviceName: 'web',
    serviceId: 'id-web',
    kind: 'changed',
    baseValue: 'npm start',
    baseSource: 'base',
    envValue: 'npm run staging',
    envSource: 'environment',
    masked: false,
  },
  {
    key: 'svc:web:linuxUser',
    area: 'linuxUser',
    label: 'Linux user',
    field: 'linuxUser',
    serviceName: 'web',
    serviceId: 'id-web',
    kind: 'changed',
    baseValue: 'website',
    baseSource: 'base',
    envValue: 'staging-web',
    envSource: 'environment',
    masked: false,
  },
  {
    key: 'var:API_URL',
    area: 'variable',
    label: 'API_URL',
    field: null,
    serviceName: null,
    serviceId: null,
    kind: 'changed',
    baseValue: 'https://api.example.com',
    baseSource: 'project',
    envValue: 'https://api.staging.example.com',
    envSource: 'environment',
    masked: false,
  },
  {
    key: 'svc:worker',
    area: 'service',
    label: 'worker',
    field: null,
    serviceName: 'worker',
    serviceId: 'id-worker',
    kind: 'added',
    baseValue: null,
    baseSource: null,
    envValue: 'node',
    envSource: 'environment',
    masked: false,
  },
]

/** The Staging environment: follows the Base, four changes. */
export function stagingView(): EnvironmentConfigViewResponse {
  const stagingWeb = service('web', 'node', [
    fieldRow('web', 'command', 'npm run staging', { source: 'environment' }),
    fieldRow('web', 'linuxUser', 'staging-web', { source: 'environment' }),
    domainRow('web', 'shop.example.com'),
    domainRow('web', 'staging.example.com', { source: 'environment' }),
  ])
  const worker = service(
    'worker',
    'node',
    [fieldRow('worker', 'command', 'node worker.js', { source: 'environment' })],
    { source: 'environment' }
  )
  const cache = service('cache', 'container', [fieldRow('cache', 'image', 'redis:7')])
  const api = service('api', 'container', [
    fieldRow('api', 'image', 'ghcr.io/example/api:1'),
    fieldRow('api', 'environment.TOKEN', null, { masked: true }),
  ])
  return {
    ok: true,
    environmentId: 'env-staging',
    projectId: 'project-1',
    followsBase: true,
    base: {
      services: [baseWeb, cache],
      variables: [variable('API_URL', 'https://api.example.com'), variable('MODE', 'live')],
      linuxUsers: baseUsers,
    },
    effective: {
      services: [stagingWeb, worker, cache, api],
      variables: [
        variable('API_URL', 'https://api.staging.example.com', {
          variableId: 'var-env-API_URL',
          source: 'environment',
        }),
        variable('MODE', 'live', { forBuild: true }),
        variable('SECRET_KEY', null, { isSecret: true, forBuild: true, forRuntime: false }),
        variable('EMPTY', '', { forBuild: false, forRuntime: false }),
        variable('BUILD_ONLY', '1', { forBuild: true, forRuntime: false }),
      ],
      linuxUsers: [
        { name: 'website', access: 'sftp', description: null, source: 'base', usedBy: [] },
        { name: 'staging-web', access: 'none', description: null, source: 'base', usedBy: ['web'] },
      ],
    },
    changes: STAGING_CHANGES,
  }
}

/** An environment that stands alone: every row is its own. */
export function standaloneView(): EnvironmentConfigViewResponse {
  const view = stagingView()
  return {
    ...view,
    followsBase: false,
    effective: {
      ...view.effective,
      services: view.effective.services.map((item) => ({
        ...item,
        source: 'environment' as const,
        rows: item.rows.map((row) => ({ ...row, source: 'environment' as const })),
      })),
    },
  }
}

/** Follows the Base and changes nothing. */
export function plainView(): EnvironmentConfigViewResponse {
  const view = stagingView()
  return {
    ...view,
    effective: {
      services: [baseWeb],
      variables: [variable('MODE', 'live')],
      linuxUsers: baseUsers,
    },
    changes: [],
  }
}
