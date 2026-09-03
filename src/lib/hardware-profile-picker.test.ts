import { describe, expect, it } from 'vitest'
import type { MetricsCapabilities, MetricsSensorCandidate } from '@/lib/instance-api'
import {
  buildGpuDeviceProfileUpdate,
  buildNicProfileUpdates,
  buildSlotProfileUpdates,
  gpuDeviceOptions,
  resolveSensorsPanelViewState,
  sensorOptions,
  type SlotField,
  slotSelectionFromProfile,
  slotUpdate,
} from '@/lib/hardware-profile-picker'

function candidate(
  overrides: Partial<MetricsSensorCandidate> & { chip: string; label: string; path: string },
): MetricsSensorCandidate {
  return { reading: null, ...overrides }
}

const EMPTY_SENSORS: MetricsCapabilities['sensors'] = {
  cpuTemperature: [],
  cpuPower: [],
  cpuFan: [],
  gpuFan: [],
  boardTemperature: [],
  ambient1Temperature: [],
  ambient2Temperature: [],
  disk1Temperature: [],
  disk2Temperature: [],
  systemFan1: [],
  systemFan2: [],
  gpuDevices: [],
}

const EMPTY_CAPABILITIES: MetricsCapabilities = {
  sensors: EMPTY_SENSORS,
  storageMounts: {
    system: null,
    hosting: { probedPath: null, result: null },
    docker: { probedPath: null, result: null },
    candidates: [],
  },
  networkInterfaces: [],
  process: { probedPath: '/proc' },
}

function capabilitiesWith(
  sensors: Partial<MetricsCapabilities['sensors']>,
): MetricsCapabilities {
  return {
    ...EMPTY_CAPABILITIES,
    sensors: { ...EMPTY_SENSORS, ...sensors },
  }
}

describe('resolveSensorsPanelViewState', () => {
  it('shows the VM empty state for a no_hwmon host', () => {
    const capabilities = capabilitiesWith({
      reasons: { diskTemperature: 'no_hwmon' },
    })
    expect(resolveSensorsPanelViewState(capabilities, false)).toEqual({
      showSensorCandidates: false,
      emptyStateVariant: 'vm',
      showDrivetempControl: false,
    })
  })

  it('shows fields plus the drivetemp opt-in for a SATA/SAS host missing drivetemp', () => {
    // CPU sensors are present (so the empty-state branch never triggers) —
    // only the disk-temperature pool is empty, because of drivetemp_not_loaded.
    const capabilities = capabilitiesWith({
      cpuTemperature: [
        candidate({ chip: 'coretemp', label: 'Package id 0', path: '/sys/.../temp1_input' }),
      ],
      reasons: { diskTemperature: 'drivetemp_not_loaded' },
    })
    expect(resolveSensorsPanelViewState(capabilities, false)).toEqual({
      showSensorCandidates: true,
      emptyStateVariant: null,
      showDrivetempControl: true,
    })
  })

  it('hides the drivetemp control on a host where it is not relevant', () => {
    // e.g. an NVMe-only host: disk1Temperature already has candidates, so no
    // reason is reported at all.
    const capabilities = capabilitiesWith({
      disk1Temperature: [
        candidate({ chip: 'nvme0n1', label: 'Composite', path: '/sys/.../temp1_input' }),
      ],
    })
    expect(resolveSensorsPanelViewState(capabilities, false)).toEqual({
      showSensorCandidates: true,
      emptyStateVariant: null,
      showDrivetempControl: false,
    })
  })

  it('keeps showing the drivetemp control once enabled, even after the reason clears', () => {
    const capabilities = capabilitiesWith({
      disk1Temperature: [
        candidate({ chip: 'sda', label: 'temp1', path: '/sys/.../temp1_input' }),
      ],
      // drivetemp loaded successfully — the pool is no longer empty, so the
      // daemon no longer reports a reason at all.
    })
    expect(resolveSensorsPanelViewState(capabilities, true).showDrivetempControl).toBe(
      true,
    )
  })

  it('falls back to the generic empty state when nothing is discovered for a reason other than no_hwmon', () => {
    const capabilities = capabilitiesWith({
      reasons: { diskTemperature: 'no_disk_temperature_source' },
    })
    expect(resolveSensorsPanelViewState(capabilities, false).emptyStateVariant).toBe(
      'generic',
    )
  })
})

describe('sensorOptions', () => {
  it('encodes each candidate as a chip:label key and shows its live reading', () => {
    const options = sensorOptions([
      candidate({
        chip: 'coretemp',
        label: 'Package id 0',
        path: '/sys/class/hwmon/hwmon0/temp1_input',
        reading: { value: 45, unit: 'celsius' },
      }),
    ])
    expect(options).toEqual([
      {
        value: 'coretemp:Package id 0',
        label: 'coretemp · Package id 0',
        detail: '45.0 °C · /sys/class/hwmon/hwmon0/temp1_input',
      },
    ])
  })

  it('shows a fan candidate reading in RPM', () => {
    const options = sensorOptions([
      candidate({
        chip: 'nct6775',
        label: 'sys_fan1',
        path: '/sys/class/hwmon/hwmon1/fan1_input',
        reading: { value: 800, unit: 'rpm' },
      }),
    ])
    expect(options[0].detail).toBe('800 RPM · /sys/class/hwmon/hwmon1/fan1_input')
  })

  it('falls back to the bare path when a candidate has no live reading', () => {
    const options = sensorOptions([
      candidate({ chip: 'amdgpu', label: 'edge', path: '/sys/.../temp1_input' }),
    ])
    expect(options[0].detail).toBe('/sys/.../temp1_input')
  })
})

describe('gpuDeviceOptions', () => {
  it('picks the temperature candidate as the device identity and shows its reading', () => {
    const capabilities = capabilitiesWith({
      gpuDevices: [
        {
          path: '/sys/class/hwmon/hwmon1',
          chip: 'amdgpu',
          temperature: [
            candidate({
              chip: 'amdgpu',
              label: 'edge',
              path: '/sys/class/hwmon/hwmon1/temp1_input',
              reading: { value: 61, unit: 'celsius' },
            }),
          ],
          power: [
            candidate({
              chip: 'amdgpu',
              label: 'PPT',
              path: '/sys/class/hwmon/hwmon1/power1_average',
              reading: { value: 37, unit: 'watts' },
            }),
          ],
          fan: [],
        },
      ],
    })
    expect(gpuDeviceOptions(capabilities)).toEqual([
      {
        value: 'amdgpu:edge',
        label: 'amdgpu',
        detail: '61.0 °C · /sys/class/hwmon/hwmon1',
      },
    ])
  })

  it('omits a device with neither a temperature nor a power candidate — it has no identity selectGpuDevice() can match', () => {
    const capabilities = capabilitiesWith({
      gpuDevices: [
        {
          path: '/sys/class/hwmon/hwmon2',
          chip: 'amdgpu',
          temperature: [],
          power: [],
          fan: [
            candidate({
              chip: 'amdgpu',
              label: 'fan1',
              path: '/sys/class/hwmon/hwmon2/fan1_input',
              reading: { value: 1800, unit: 'rpm' },
            }),
          ],
        },
      ],
    })
    expect(gpuDeviceOptions(capabilities)).toEqual([])
  })
})

describe('buildSlotProfileUpdates', () => {
  function baseSelection(): Record<SlotField, string | null> {
    return slotSelectionFromProfile(null)
  }

  it('omits a slot that was never configured and was left untouched — never disables auto-detection', () => {
    const initial = baseSelection()
    const selection = baseSelection()
    const updates = buildSlotProfileUpdates(selection, initial, new Set())
    expect(updates.cpuTemperature).toBeUndefined()
    expect('cpuTemperature' in updates).toBe(false)
  })

  it('resends an already-configured slot even when left untouched', () => {
    const initial = { ...baseSelection(), cpuTemperature: 'coretemp:Package id 0' }
    const selection = { ...initial }
    const updates = buildSlotProfileUpdates(selection, initial, new Set())
    expect(updates.cpuTemperature).toEqual({ chip: 'coretemp', label: 'Package id 0' })
  })

  it('sends null for a never-configured slot the operator explicitly touched', () => {
    const initial = baseSelection()
    const selection = baseSelection() // still null — operator opened it and left "Auto detected"
    const updates = buildSlotProfileUpdates(selection, initial, new Set<SlotField>(['cpuTemperature']))
    expect('cpuTemperature' in updates).toBe(true)
    expect(updates.cpuTemperature).toBeNull()
  })

  it('sends the picked value for a never-configured slot the operator assigned', () => {
    const initial = baseSelection()
    const selection = { ...baseSelection(), cpuFan: 'nct6775:sys_fan1' }
    const updates = buildSlotProfileUpdates(selection, initial, new Set<SlotField>(['cpuFan']))
    expect(updates.cpuFan).toEqual({ chip: 'nct6775', label: 'sys_fan1' })
  })

  it('sends null for an already-configured slot the operator explicitly cleared', () => {
    const initial = { ...baseSelection(), cpuPower: 'rapl:package-0' }
    const selection = { ...initial, cpuPower: null }
    const updates = buildSlotProfileUpdates(selection, initial, new Set<SlotField>(['cpuPower']))
    expect('cpuPower' in updates).toBe(true)
    expect(updates.cpuPower).toBeNull()
  })
})

describe('buildGpuDeviceProfileUpdate', () => {
  it('omits when never configured and untouched', () => {
    expect(buildGpuDeviceProfileUpdate(null, null, false)).toBeUndefined()
  })

  it('resends an already-configured device even when untouched', () => {
    expect(buildGpuDeviceProfileUpdate('amdgpu:edge', 'amdgpu:edge', false)).toEqual({
      chip: 'amdgpu',
      label: 'edge',
    })
  })

  it('sends null once touched, even if never configured before', () => {
    expect(buildGpuDeviceProfileUpdate(null, null, true)).toBeNull()
  })

  it('sends the picked device once touched', () => {
    expect(buildGpuDeviceProfileUpdate('amdgpu:edge', null, true)).toEqual({
      chip: 'amdgpu',
      label: 'edge',
    })
  })
})

describe('buildNicProfileUpdates', () => {
  it('omits a NIC binding that was never configured and was left untouched', () => {
    const initial = { nic1: null, nic2: null }
    const updates = buildNicProfileUpdates(initial, initial, new Set())
    expect('nic1' in updates).toBe(false)
    expect('nic2' in updates).toBe(false)
  })

  it('resends an already-bound NIC even when untouched', () => {
    const initial = { nic1: 'eth0', nic2: null }
    const updates = buildNicProfileUpdates(initial, initial, new Set())
    expect(updates.nic1).toBe('eth0')
    expect('nic2' in updates).toBe(false)
  })

  it('sends null for a never-configured NIC the operator explicitly touched', () => {
    const initial = { nic1: null, nic2: null }
    const updates = buildNicProfileUpdates(initial, initial, new Set(['nic1' as const]))
    expect('nic1' in updates).toBe(true)
    expect(updates.nic1).toBeNull()
  })
})

describe('slotUpdate', () => {
  it('decodes a chip:label key back into the wire slot shape', () => {
    expect(slotUpdate('coretemp:Package id 0')).toEqual({
      chip: 'coretemp',
      label: 'Package id 0',
    })
  })

  it('splits only on the first colon, so a label containing one survives intact', () => {
    expect(slotUpdate('nct6775:SYS:AUX')).toEqual({
      chip: 'nct6775',
      label: 'SYS:AUX',
    })
  })

  it('maps null to an explicit unassignment', () => {
    expect(slotUpdate(null)).toBeNull()
  })
})
