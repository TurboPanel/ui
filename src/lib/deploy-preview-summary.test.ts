import { describe, expect, it } from 'vitest'
import { normalizeCompose } from '@/lib/compose/types'
import type { DeployPreviewResponse } from '@/lib/instance-api'
import { buildDeploySummary, platformVariableMeaning } from './deploy-preview-summary'

const document = normalizeCompose({
  version: 1,
  presentation: { keyOrder: ['services'], comments: {} },
  data: {
    services: {
      web: {
        'x-turbopanel': {
          serviceKind: 'node',
          source: { sourceId: 'src_1', branch: 'main' },
          hosting: [{ hostname: 'App.Example.com' }],
        },
      },
      db: { image: 'postgres:17' },
      blog: { 'x-turbopanel': { serviceKind: 'site', php: { version: '8.4' } } },
    },
  },
})

function preview(extra: Partial<DeployPreviewResponse> = {}): DeployPreviewResponse {
  return {
    ok: true,
    composeFiles: [],
    projectName: 'demo',
    containers: [],
    volumes: [],
    warnings: [],
    sources: [
      {
        composeServiceName: 'web',
        sourceId: 'src_1',
        provider: 'github',
        cloneUrl: 'https://github.com/acme/app.git',
        ref: 'main',
        releaseId: 'rel_1',
      },
    ],
    nativeAppVariables: [
      {
        composeServiceName: 'web',
        variables: [
          {
            name: 'HOST',
            source: 'platform',
            isSecret: false,
            value: '127.0.0.1',
            delivered: true,
          },
          { name: 'PORT', source: 'platform', isSecret: false, value: '3000', delivered: true },
          {
            name: 'NODE_ENV',
            source: 'platform',
            isSecret: false,
            value: 'production',
            delivered: true,
          },
          { name: 'API_KEY', source: 'project', isSecret: true, value: null, delivered: true },
          { name: 'TOKEN', source: 'platform', isSecret: true, value: 'leaked', delivered: true },
        ],
      },
    ],
    ...extra,
  } as DeployPreviewResponse
}

describe('buildDeploySummary', () => {
  it('makes one row per service with kind, server, origin and hostnames', () => {
    const { services } = buildDeploySummary({
      document,
      preview: preview(),
      placementLabel: 'omicron',
    })
    expect(services.map((s) => [s.name, s.kind])).toEqual([
      ['web', 'Node app'],
      ['db', 'Container'],
      ['blog', 'PHP site'],
    ])
    expect(services[0]).toMatchObject({
      servers: ['omicron'],
      origin: 'acme/app @ main',
      hostnames: [{ name: 'app.example.com', tunnel: false }],
    })
    expect(services[1].origin).toBe('Image postgres:17')
  })

  it('marks a tunnel name and merges saved names without repeats', () => {
    const { services } = buildDeploySummary({
      document,
      preview: null,
      placementLabel: null,
      savedHostnames: { web: ['app.example.com', 'tun.example.com'] },
      tunnelHostnames: new Set(['tun.example.com']),
    })
    expect(services[0].servers).toEqual([])
    expect(services[0].hostnames).toEqual([
      { name: 'app.example.com', tunnel: false },
      { name: 'tun.example.com', tunnel: true },
    ])
  })

  it('names each server when the plan spans several', () => {
    const { services } = buildDeploySummary({
      document,
      preview: preview({
        servers: [
          { serverId: 's1', name: 'omicron', composeFiles: [], services: ['web'] },
          { serverId: 's2', name: ' ', composeFiles: [], services: ['db', 'web'] },
        ],
      }),
      placementLabel: 'omicron',
    })
    expect(services[0].servers).toEqual(['omicron', 's2'])
    expect(services[1].servers).toEqual(['s2'])
  })

  it('lists only what TurboPanel sets, with meanings, and never a secret value', () => {
    const { variableGroups } = buildDeploySummary({
      document,
      preview: preview(),
      placementLabel: 'omicron',
    })
    expect(variableGroups).toHaveLength(1)
    const byName = Object.fromEntries(variableGroups[0].variables.map((v) => [v.name, v]))
    expect(Object.keys(byName)).toEqual(['HOST', 'PORT', 'NODE_ENV', 'TOKEN'])
    expect(byName.HOST.meaning).toBe('listen address, not the public name')
    expect(byName.PORT.meaning).toBe('port the app listens on')
    expect(byName.TOKEN.value).toBeNull()
    expect(JSON.stringify(variableGroups)).not.toContain('leaked')
  })

  it('has a meaning for HOSTNAME and a fallback for unknown names', () => {
    expect(platformVariableMeaning('HOSTNAME')).toContain('listen address')
    expect(platformVariableMeaning('SOMETHING')).toBe('set by TurboPanel for every app')
  })

  it('splits a service’s own variables into building and running, by the name set', () => {
    const { serviceVariables } = buildDeploySummary({
      document,
      placementLabel: 'omicron',
      preview: preview({
        serviceVariables: [
          {
            composeServiceName: 'web',
            variables: [
              {
                name: 'NODE_OPTIONS',
                source: 'service',
                isSecret: false,
                value: '--max-old-space-size=2048',
                forBuild: true,
                forRuntime: true,
              },
              {
                name: 'BUILD_ONLY',
                source: 'project',
                isSecret: false,
                value: '1',
                forBuild: true,
                forRuntime: false,
              },
              {
                name: 'NPM_AUTH',
                source: 'project',
                isSecret: true,
                value: 'leaked',
                forBuild: true,
                forRuntime: false,
              },
              {
                name: 'RUN_ONLY',
                source: 'project',
                isSecret: false,
                value: 'x',
                forBuild: false,
                forRuntime: true,
              },
            ],
          },
        ],
      }),
    })
    expect(serviceVariables).toHaveLength(1)
    expect(serviceVariables[0].building.map((v) => v.name)).toEqual([
      'NODE_OPTIONS',
      'BUILD_ONLY',
      'NPM_AUTH',
    ])
    expect(serviceVariables[0].running.map((v) => v.name)).toEqual(['NODE_OPTIONS', 'RUN_ONLY'])
    expect(JSON.stringify(serviceVariables)).not.toContain('leaked')
    expect(JSON.stringify(serviceVariables)).not.toContain('web__')
  })

  it('has no variable groups when the answer predates them', () => {
    expect(
      buildDeploySummary({ document, preview: preview(), placementLabel: null }).serviceVariables
    ).toEqual([])
  })
})
