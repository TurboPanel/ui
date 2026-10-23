import { describe, expect, it } from 'vitest'
import { HOST_FACT_LABELS, hostFactRows } from './host-facts'

describe('hostFactRows', () => {
  it('shows only what the host reported, in the fixed order, in plain words', () => {
    const rows = hostFactRows({
      text: { kernel: '6.12.0', os: 'debian 13', phpVersions: '8.4, 8.3' },
      blockDevices: [],
      gpus: [],
    })
    expect(rows.map((row) => row.label)).toEqual(['Operating system', 'Kernel', 'PHP versions'])
    expect(rows[0]).toEqual({ key: 'os', label: 'Operating system', value: 'debian 13' })
  })

  it('adds each drive and GPU that has text, skipping those with none', () => {
    const rows = hostFactRows({
      text: {},
      blockDevices: [
        { deviceId: 'nvme0n1', model: 'Samsung 990', smart: 'PASSED' },
        { deviceId: 'sda' },
      ],
      gpus: [{ gpuId: 'gpu0', model: 'RTX 5060 Ti', driver: '595.80' }],
    })
    expect(rows).toEqual([
      { key: 'drive:nvme0n1', label: 'Drive nvme0n1', value: 'Samsung 990 · SMART PASSED' },
      { key: 'gpu:gpu0', label: 'GPU gpu0', value: 'RTX 5060 Ti · driver 595.80' },
    ])
  })

  it('is empty for a host that reports nothing, and every label key is unique', () => {
    expect(hostFactRows({ text: {}, blockDevices: [], gpus: [] })).toEqual([])
    const keys = HOST_FACT_LABELS.map(([key]) => key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
