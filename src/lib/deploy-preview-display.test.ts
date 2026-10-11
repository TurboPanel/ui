import { describe, expect, it } from 'vitest'
import {
  nativeAppVariableLine,
  nativeAppVariableSourceLabel,
  preparedPerServerCompose,
} from './deploy-preview-display'
import type { DeployPreviewNativeAppVariable, DeployPreviewServer } from './instance-api'

const FILE = {
  filename: 'compose.yaml',
  role: 'runtime' as const,
  content: 'services: {}\n',
}

function server(id: string, name: string): DeployPreviewServer {
  return { serverId: id, name, composeFiles: [FILE], services: ['adminer'] }
}

describe('preparedPerServerCompose', () => {
  it('hides a single-server duplicate of the top-level runtime file', () => {
    expect(preparedPerServerCompose([server('s1', 'au1')])).toEqual([])
    expect(preparedPerServerCompose(undefined)).toEqual([])
  })

  it('keeps per-host blocks when the plan spans servers', () => {
    const rows = [server('s1', 'au1'), server('s2', 'au2')]
    expect(preparedPerServerCompose(rows)).toEqual(rows)
  })
})

describe('nativeAppVariableLine', () => {
  const base: DeployPreviewNativeAppVariable = {
    name: 'API_URL',
    source: 'project',
    isSecret: false,
    value: 'https://example.test',
    delivered: true,
  }

  it('shows a plain value and where it was set', () => {
    expect(nativeAppVariableLine(base)).toBe(
      'API_URL = https://example.test (project variable)',
    )
  })

  it('never shows a secret, even if a value were present', () => {
    const secret = { ...base, name: 'DB_PASSWORD', isSecret: true, value: null, source: 'organization' }
    expect(nativeAppVariableLine(secret)).toBe(
      'DB_PASSWORD = hidden (secret) (organization variable)',
    )
    expect(nativeAppVariableLine({ ...secret, value: 'leaked' })).not.toContain('leaked')
  })

  it('says why a name does not reach the process', () => {
    expect(
      nativeAppVariableLine({
        ...base,
        name: 'PORT',
        value: '1',
        source: 'environment',
        delivered: false,
        reason: 'platform',
      }),
    ).toBe('PORT = 1 (environment variable; not passed: TurboPanel sets this one itself)')
  })

  it('tells the owner how to pass a secret that was set above the app', () => {
    expect(
      nativeAppVariableLine({
        name: 'STRIPE_KEY',
        source: 'organization',
        isSecret: true,
        value: null,
        delivered: false,
        reason: 'not_referenced',
      }),
    ).toBe(
      "STRIPE_KEY = hidden (secret) (organization variable; not passed: it was set above this app, so the app has to ask for it) (to pass it, add {$STRIPE_KEY} to the app's environment)",
    )
  })

  it('names the platform and managed-database sources, and tolerates new ones', () => {
    expect(nativeAppVariableSourceLabel('platform')).toBe('set by TurboPanel')
    expect(nativeAppVariableSourceLabel('binding')).toBe('managed database')
    expect(nativeAppVariableSourceLabel('something-new')).toBe('unknown source')
  })
})
