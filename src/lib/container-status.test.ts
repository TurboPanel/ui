import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/theme', () => ({
  colors: {
    textMuted: '#888',
    green: '#3dd68c',
    pending: '#e0b341',
    error: '#ff6b6b',
  },
}))

import {
  environmentStatusTone,
  serviceStatusTone,
} from '@/lib/container-status'
import type { ContainerRecord } from '@/lib/instance-api'
import { colors } from '@/lib/theme'

function container(
  overrides: Partial<ContainerRecord> & Pick<ContainerRecord, 'status'>,
): ContainerRecord {
  return {
    id: 'c1',
    serviceId: 's1',
    serverId: 'srv1',
    containerId: 'abc123',
    containerName: 'name',
    role: 'service',
    composeServiceName: 'web',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('serviceStatusTone', () => {
  it('returns Unknown for an empty list', () => {
    expect(serviceStatusTone([])).toEqual({
      color: colors.textMuted,
      label: 'Unknown',
    })
  })

  it('prefers Running when any container is running', () => {
    expect(
      serviceStatusTone([
        container({ status: 'exited' }),
        container({ status: 'running' }),
      ]),
    ).toEqual({ color: colors.green, label: 'Running' })
  })

  it('maps restarting/created/paused to Pending', () => {
    expect(serviceStatusTone([container({ status: 'restarting' })])).toEqual({
      color: colors.pending,
      label: 'Pending',
    })
    expect(serviceStatusTone([container({ status: 'created' })])).toEqual({
      color: colors.pending,
      label: 'Pending',
    })
    expect(serviceStatusTone([container({ status: 'paused' })])).toEqual({
      color: colors.pending,
      label: 'Pending',
    })
  })

  it('maps exited/dead/removing to Stopped', () => {
    expect(serviceStatusTone([container({ status: 'exited' })])).toEqual({
      color: colors.error,
      label: 'Stopped',
    })
    expect(serviceStatusTone([container({ status: 'dead' })])).toEqual({
      color: colors.error,
      label: 'Stopped',
    })
    expect(serviceStatusTone([container({ status: 'removing' })])).toEqual({
      color: colors.error,
      label: 'Stopped',
    })
  })

  it('falls back to Unknown for unrecognized statuses', () => {
    expect(serviceStatusTone([container({ status: 'pending' })])).toEqual({
      color: colors.textMuted,
      label: 'Unknown',
    })
  })
})

describe('environmentStatusTone', () => {
  it('is Not started yet when empty or only allocator pins', () => {
    expect(environmentStatusTone([])).toEqual({
      color: colors.textMuted,
      label: 'Not started yet',
    })
    expect(
      environmentStatusTone([
        container({ status: 'pending', containerId: '' }),
      ]),
    ).toEqual({
      color: colors.textMuted,
      label: 'Not started yet',
    })
  })

  it('maps host-deployed containers like service tones with env labels', () => {
    expect(
      environmentStatusTone([container({ status: 'running' })]),
    ).toEqual({ color: colors.green, label: 'Running' })
    expect(
      environmentStatusTone([container({ status: 'created' })]),
    ).toEqual({ color: colors.pending, label: 'Starting…' })
    expect(
      environmentStatusTone([container({ status: 'exited' })]),
    ).toEqual({ color: colors.error, label: 'Stopped' })
    expect(
      environmentStatusTone([container({ status: 'pending' })]),
    ).toEqual({ color: colors.textMuted, label: 'Unknown' })
  })
})
