import { describe, expect, it } from 'vitest'
import {
  hasHostDeployedContainers,
  isActiveContainerStatus,
} from '@/lib/container-status-guards'
import type { ContainerRecord } from '@/lib/instance-api'

function row(
  overrides: Partial<ContainerRecord> & Pick<ContainerRecord, 'status'>,
): ContainerRecord {
  return {
    id: 'row-1',
    serviceId: 'svc-1',
    serverId: 'srv-1',
    containerId: '',
    containerName: 'web',
    role: 'service',
    composeServiceName: 'web',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('isActiveContainerStatus', () => {
  it('recognizes active statuses', () => {
    expect(isActiveContainerStatus('running')).toBe(true)
    expect(isActiveContainerStatus('restarting')).toBe(true)
    expect(isActiveContainerStatus('created')).toBe(true)
    expect(isActiveContainerStatus('paused')).toBe(true)
  })

  it('rejects inactive or missing statuses', () => {
    expect(isActiveContainerStatus(undefined)).toBe(false)
    expect(isActiveContainerStatus('exited')).toBe(false)
    expect(isActiveContainerStatus('pending')).toBe(false)
    expect(isActiveContainerStatus('dead')).toBe(false)
  })
})

describe('hasHostDeployedContainers', () => {
  it('is false for an empty list', () => {
    expect(hasHostDeployedContainers([])).toBe(false)
  })

  it('treats a non-empty Docker containerId as deployed', () => {
    expect(
      hasHostDeployedContainers([
        row({ status: 'pending', containerId: 'abc123' }),
      ]),
    ).toBe(true)
    expect(
      hasHostDeployedContainers([
        row({ status: 'pending', containerId: '  ' }),
      ]),
    ).toBe(false)
  })

  it('counts post-create statuses without a container id', () => {
    for (const status of [
      'running',
      'restarting',
      'created',
      'paused',
      'exited',
      'dead',
      'removing',
    ] as const) {
      expect(hasHostDeployedContainers([row({ status })])).toBe(true)
    }
  })

  it('ignores allocator pending pins with no container id', () => {
    expect(
      hasHostDeployedContainers([row({ status: 'pending', containerId: '' })]),
    ).toBe(false)
  })
})
