import { describe, expect, it } from 'vitest'
import { hasHostDeployedContainers } from './container-status-guards'
import type { ContainerRecord } from './instance-api'

function container(
  overrides: Partial<ContainerRecord> & Pick<ContainerRecord, 'status'>,
): ContainerRecord {
  return {
    id: 'c1',
    serviceId: 's1',
    serverId: 'srv1',
    containerId: '',
    containerName: 'name',
    role: 'service',
    composeServiceName: 'web',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('hasHostDeployedContainers', () => {
  it('is false for empty and pending allocator pins', () => {
    expect(hasHostDeployedContainers([])).toBe(false)
    expect(
      hasHostDeployedContainers([
        container({ status: 'pending', containerId: '' }),
      ]),
    ).toBe(false)
  })

  it('is true when a Docker container id or host status exists', () => {
    expect(
      hasHostDeployedContainers([
        container({ status: 'pending', containerId: 'abc123' }),
      ]),
    ).toBe(true)
    expect(
      hasHostDeployedContainers([container({ status: 'exited' })]),
    ).toBe(true)
    expect(
      hasHostDeployedContainers([container({ status: 'running' })]),
    ).toBe(true)
  })
})
