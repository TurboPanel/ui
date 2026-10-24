import { describe, expect, it } from 'vitest'
import { changedEngineSettings, changedHostingSettings } from '@/lib/managed-advanced-settings'
import type { ManagedSettings } from '@/lib/managed-services'

const settings = (over: Partial<ManagedSettings> = {}) => ({ ssl: {}, ...over }) as ManagedSettings

describe('changed advanced settings', () => {
  it('lists nothing for the defaults', () => {
    expect(changedEngineSettings(settings())).toEqual([])
    expect(
      changedEngineSettings(settings({ dockerOptions: { restart: 'unless-stopped' } } as never))
    ).toEqual([])
    expect(changedHostingSettings(settings())).toEqual([])
  })

  it('lists each changed engine setting, resource limit and Docker option', () => {
    const changed = changedEngineSettings(
      settings({
        engineConfig: 'max_connections=200',
        resources: { cpus: 2, memoryBytes: 1024 * 1024 * 1024 },
        dockerOptions: { restart: 'always', labels: { team: 'web' }, extraEnv: { A: '1', B: '2' } },
      } as never)
    )
    expect(changed.map((row) => [row.label, row.value])).toEqual([
      ['Engine settings', 'Custom'],
      ['CPU limit', '2 CPUs'],
      ['Memory limit', '1.00 GiB'],
      ['Restart policy', 'always'],
      ['Labels', '1 label'],
      ['Extra env', '2 variables'],
    ])
  })

  it('lists a client TLS mode set on the database', () => {
    expect(changedHostingSettings(settings({ ssl: { mode: 'verify-full' } }))).toEqual([
      { key: 'ssl', label: 'Client TLS', value: 'verify-full' },
    ])
  })
})
