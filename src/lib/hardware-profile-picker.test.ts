import { describe, expect, it } from 'vitest'
import type {
  EffectiveCpuThermalLimits,
  MetricsCapabilities,
  MetricsSensorCandidate,
  NetworkInventoryEntry,
  ServerHardwareProfile,
} from '@/lib/instance-api'
import {
  DISK_SLOT_FIELDS,
  MAX_NIC_SLOTS,
  REGULAR_SLOT_FIELDS,
  SLOT_FIELDS,
  applyNicSlotChange,
  autoPrimaryNic,
  buildGpuDeviceProfileUpdate,
  buildNicSlotProfileUpdate,
  buildSlotProfileUpdates,
  cpuLimitPrefill,
  emptyTouchedSelection,
  errorMessage,
  gpuDeviceOptions,
  gpuDeviceSelectionFromProfile,
  hostingPathOptions,
  monitorableNics,
  nicSlotListFromSelection,
  nicSlotOptions,
  nicSlotRowCount,
  nicSlotSelectionFromProfile,
  nicSlotsReassigned,
  parseNumericDraft,
  resolveSensorsPanelViewState,
  sensorOptions,
  snapshotFromProfile,
  type SlotField,
  slotCandidatesFor,
  slotSelectionFromProfile,
  slotUpdate,
} from '@/lib/hardware-profile-picker'

function candidate(
  overrides: Partial<MetricsSensorCandidate> & { chip: string; label: string; path: string }
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

function capabilitiesWith(sensors: Partial<MetricsCapabilities['sensors']>): MetricsCapabilities {
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
      disk1Temperature: [candidate({ chip: 'sda', label: 'temp1', path: '/sys/.../temp1_input' })],
      // drivetemp loaded successfully — the pool is no longer empty, so the
      // daemon no longer reports a reason at all.
    })
    expect(resolveSensorsPanelViewState(capabilities, true).showDrivetempControl).toBe(true)
  })

  it('falls back to the generic empty state when nothing is discovered for a reason other than no_hwmon', () => {
    const capabilities = capabilitiesWith({
      reasons: { diskTemperature: 'no_disk_temperature_source' },
    })
    expect(resolveSensorsPanelViewState(capabilities, false).emptyStateVariant).toBe('generic')
  })

  it('treats a GPU-only discovery as having sensor candidates', () => {
    const capabilities = capabilitiesWith({
      gpuDevices: [
        {
          path: '/sys/class/hwmon/hwmon1',
          chip: 'amdgpu',
          temperature: [
            candidate({ chip: 'amdgpu', label: 'edge', path: '/sys/.../temp1_input' }),
          ],
          power: [],
          fan: [],
        },
      ],
    })
    expect(resolveSensorsPanelViewState(capabilities, false)).toEqual({
      showSensorCandidates: true,
      emptyStateVariant: null,
      showDrivetempControl: false,
    })
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

  it('uses a power candidate as the identity and shows watts when temperature is absent', () => {
    const capabilities = capabilitiesWith({
      gpuDevices: [
        {
          path: '/sys/class/hwmon/hwmon1',
          chip: 'amdgpu',
          temperature: [],
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
        value: 'amdgpu:PPT',
        label: 'amdgpu',
        detail: '37.0 W · /sys/class/hwmon/hwmon1',
      },
    ])
  })

  it('uses a DRM engine-busy candidate as the device identity when temp and power are absent', () => {
    const capabilities = capabilitiesWith({
      gpuDevices: [
        {
          path: '/sys/class/drm/card0',
          chip: 'i915',
          temperature: [],
          power: [],
          utilization: [
            candidate({
              chip: 'i915',
              label: 'rcs0',
              path: '/sys/class/drm/card0/engine/rcs0/busy',
            }),
          ],
          fan: [],
        },
      ],
    })
    expect(gpuDeviceOptions(capabilities)).toEqual([
      {
        value: 'i915:rcs0',
        label: 'i915',
        detail: '/sys/class/drm/card0',
      },
    ])
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
    const updates = buildSlotProfileUpdates(
      selection,
      initial,
      new Set<SlotField>(['cpuTemperature'])
    )
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

describe('monitored NIC slots', () => {
  const nic = (
    deviceId: string,
    kind: NetworkInventoryEntry['kind'],
    extra: Partial<NetworkInventoryEntry> = {}
  ): NetworkInventoryEntry => ({
    deviceId,
    name: deviceId.replace(/^mac:/, ''),
    kind,
    role: 'other',
    ...extra,
  })
  const networks: NetworkInventoryEntry[] = [
    nic('virtual:lo', 'loopback'),
    nic('mac:eth1', 'uplink', { speedMbps: 1000 }),
    nic('mac:eth0', 'uplink', { defaultRoute: true, role: 'nic', slot: 1 }),
    nic('mac:port', 'member'),
    nic('virtual:vlan', 'virtual'),
    nic('virtual:bond0', 'uplink'),
  ]

  it('offers only physical uplinks, and mirrors the daemon auto rule (default route first, then sorted id)', () => {
    expect(monitorableNics(networks).map((d) => d.deviceId)).toEqual([
      'mac:eth1',
      'mac:eth0',
      'virtual:bond0',
    ])
    expect(autoPrimaryNic(networks)?.deviceId).toBe('mac:eth0')
    expect(autoPrimaryNic(networks.filter((d) => d.deviceId !== 'mac:eth0'))?.deviceId).toBe(
      'mac:eth1'
    )
    expect(autoPrimaryNic([nic('mac:port', 'member')])).toBeNull()
    expect(nicSlotOptions([nic('mac:unnamed', 'uplink', { name: '' })], [null], 0)[0]?.label).toBe(
      'mac:unnamed'
    )
  })

  it('excludes uplinks already chosen in another slot, but keeps a stale current value visible', () => {
    const selection = ['mac:eth0', 'mac:gone', null]
    expect(nicSlotOptions(networks, selection, 2).map((o) => o.value)).toEqual([
      'mac:eth1',
      'virtual:bond0',
    ])
    const slot2 = nicSlotOptions(networks, selection, 1)
    expect(slot2.map((o) => o.value)).toEqual(['mac:eth1', 'virtual:bond0', 'mac:gone'])
    expect(slot2[2]?.detail).toContain('not in the current topology')
    const reclassified = nicSlotOptions(networks, ['mac:port'], 0)
    expect(reclassified.at(-1)?.detail).toContain('member')
  })

  it('renders the server limit worth of rows, or more when a saved list already exceeds it', () => {
    expect(nicSlotRowCount(2, [null, null, null, null])).toBe(2)
    expect(nicSlotRowCount(2, ['a', 'b', 'c', null])).toBe(3)
    expect(nicSlotRowCount(null, [])).toBe(1)
    expect(nicSlotSelectionFromProfile({ nicSlotDeviceIds: ['a', 'b'] }, 4)).toEqual([
      'a',
      'b',
      null,
      null,
    ])
    expect(nicSlotSelectionFromProfile({}, 2)).toEqual([null, null])
    expect(applyNicSlotChange(['a'], 2, 'c')).toEqual(['a', null, 'c'])
  })

  it('compacts a selection to the wire list and pins the auto primary into slot 1 when only a later slot was filled', () => {
    expect(nicSlotListFromSelection([null, null], 'mac:eth0')).toEqual([])
    expect(nicSlotListFromSelection(['mac:eth1', null, 'mac:eth1'], 'mac:eth0')).toEqual([
      'mac:eth1',
    ])
    expect(nicSlotListFromSelection([null, 'mac:eth1'], 'mac:eth0')).toEqual([
      'mac:eth0',
      'mac:eth1',
    ])
    // The auto primary picked explicitly in a later slot is not duplicated.
    expect(nicSlotListFromSelection([null, 'mac:eth0'], 'mac:eth0')).toEqual(['mac:eth0'])
  })

  it('builds a tri-state update: omitted when never configured and untouched, null when cleared', () => {
    expect(buildNicSlotProfileUpdate([null, null], [], false, 'mac:eth0')).toBeUndefined()
    expect(buildNicSlotProfileUpdate([null, null], [], true, 'mac:eth0')).toBeNull()
    expect(buildNicSlotProfileUpdate([null, null], ['mac:eth0'], false, 'mac:eth0')).toBeNull()
    expect(buildNicSlotProfileUpdate(['mac:eth0', 'mac:eth1'], [], true, null)).toEqual([
      'mac:eth0',
      'mac:eth1',
    ])
  })

  it('flags a reassignment only when a previously pinned list changes membership or order', () => {
    expect(nicSlotsReassigned([], ['mac:eth1'], 'mac:eth0')).toBe(false)
    expect(nicSlotsReassigned(['mac:eth0'], ['mac:eth0', null], 'mac:eth0')).toBe(false)
    expect(nicSlotsReassigned(['mac:eth0', 'mac:eth1'], ['mac:eth1', 'mac:eth0'], null)).toBe(true)
    expect(nicSlotsReassigned(['mac:eth0'], [null, null], 'mac:eth0')).toBe(true)
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

  it('returns null when the key has no chip:label separator', () => {
    expect(slotUpdate('coretemp')).toBeNull()
  })
})

describe('slot field catalogs', () => {
  it('splits disk temperature slots from the rest so the editor can render them separately', () => {
    expect(DISK_SLOT_FIELDS.map(({ field }) => field)).toEqual([
      'disk1Temperature',
      'disk2Temperature',
    ])
    expect(REGULAR_SLOT_FIELDS.some(({ field }) => field.startsWith('disk'))).toBe(false)
    expect(REGULAR_SLOT_FIELDS).toHaveLength(SLOT_FIELDS.length - DISK_SLOT_FIELDS.length)
    expect(MAX_NIC_SLOTS).toBe(11)
  })
})

describe('slotCandidatesFor', () => {
  it('returns the capability pool for the requested slot', () => {
    const cpu = [candidate({ chip: 'coretemp', label: 'Package id 0', path: '/sys/.../temp1' })]
    const capabilities = capabilitiesWith({ cpuTemperature: cpu })
    expect(slotCandidatesFor(capabilities, 'cpuTemperature')).toBe(cpu)
    expect(slotCandidatesFor(capabilities, 'cpuFan')).toEqual([])
  })
})

describe('hostingPathOptions', () => {
  const capabilitiesWithMounts = (
    candidates: MetricsCapabilities['storageMounts']['candidates'],
  ): MetricsCapabilities => ({
    ...EMPTY_CAPABILITIES,
    storageMounts: {
      ...EMPTY_CAPABILITIES.storageMounts,
      candidates,
    },
  })

  it('labels each discovered mount with its filesystem type', () => {
    const options = hostingPathOptions(
      capabilitiesWithMounts([
        {
          path: '/srv',
          source: '/dev/sdb1',
          fsType: 'ext4',
          totalBytes: 1,
          availableBytes: 1,
        },
      ]),
      null
    )
    expect(options).toEqual([
      { value: '/srv', label: '/srv (ext4)', detail: '/srv' },
    ])
  })

  it('keeps a stale override visible when it is no longer discovered', () => {
    const options = hostingPathOptions(capabilitiesWithMounts([]), '/old')
    expect(options).toEqual([
      {
        value: '/old',
        label: '/old',
        detail: 'Current override — no longer discovered',
      },
    ])
  })

  it('does not duplicate a current path that is still in the candidate list', () => {
    const options = hostingPathOptions(
      capabilitiesWithMounts([
        {
          path: '/srv',
          source: '/dev/sdb1',
          fsType: 'xfs',
          totalBytes: 1,
          availableBytes: 1,
        },
      ]),
      '/srv'
    )
    expect(options).toHaveLength(1)
    expect(options[0]?.value).toBe('/srv')
  })
})

describe('cpuLimitPrefill', () => {
  const exact: EffectiveCpuThermalLimits = {
    tdpWatts: 65,
    tjMaxCelsius: 100,
    source: 'catalog-exact',
  }
  const family: EffectiveCpuThermalLimits = {
    tdpWatts: 45,
    tjMaxCelsius: 95,
    source: 'catalog-family',
  }

  it('shows the catalog value and its provenance while the draft is empty', () => {
    expect(cpuLimitPrefill(true, exact, (limits) => limits.tdpWatts)).toEqual({
      placeholder: '65',
      hint: 'Matched to your exact CPU model in the catalog.',
    })
    expect(cpuLimitPrefill(true, family, (limits) => limits.tjMaxCelsius)).toEqual({
      placeholder: '95',
      hint: 'Estimated from CPU family — set an exact value if you know it.',
    })
  })

  it('falls back to auto-detection copy when the catalog has no value for that field', () => {
    expect(
      cpuLimitPrefill(true, { ...exact, tdpWatts: null }, (limits) => limits.tdpWatts)
    ).toEqual({
      placeholder: 'Auto detected',
      hint: 'Empty uses auto-detection.',
    })
  })

  it('uses the generic auto-detection hint for an operator override source', () => {
    expect(
      cpuLimitPrefill(
        true,
        { tdpWatts: 80, tjMaxCelsius: null, source: 'override' },
        (limits) => limits.tdpWatts
      )
    ).toEqual({
      placeholder: '80',
      hint: 'Empty uses auto-detection.',
    })
  })

  it('ignores catalog numbers once the operator has typed a draft', () => {
    expect(cpuLimitPrefill(false, exact, (limits) => limits.tdpWatts)).toEqual({
      placeholder: 'Auto detected',
      hint: 'Empty uses auto-detection.',
    })
  })

  it('ignores catalog numbers when the source is none or limits are missing', () => {
    expect(
      cpuLimitPrefill(
        true,
        { tdpWatts: 65, tjMaxCelsius: 100, source: 'none' },
        (limits) => limits.tdpWatts
      )
    ).toEqual({
      placeholder: 'Auto detected',
      hint: 'Empty uses auto-detection.',
    })
    expect(cpuLimitPrefill(true, null, (limits) => limits.tdpWatts)).toEqual({
      placeholder: 'Auto detected',
      hint: 'Empty uses auto-detection.',
    })
  })
})

describe('errorMessage', () => {
  it('uses the Error message when one is thrown', () => {
    expect(errorMessage(new Error('socket down'), 'fallback')).toBe('socket down')
  })

  it('uses the fallback for a non-Error rejection', () => {
    expect(errorMessage('nope', 'Failed to save hardware profile')).toBe(
      'Failed to save hardware profile'
    )
  })
})

describe('parseNumericDraft', () => {
  it('treats blank input as an explicit clear', () => {
    expect(parseNumericDraft('')).toBeNull()
    expect(parseNumericDraft('   ')).toBeNull()
  })

  it('parses a finite number', () => {
    expect(parseNumericDraft('65')).toBe(65)
    expect(parseNumericDraft(' 12.5 ')).toBe(12.5)
  })

  it('rejects non-finite input so the caller can keep the draft invalid', () => {
    expect(parseNumericDraft('abc')).toBeUndefined()
    expect(parseNumericDraft('Infinity')).toBeUndefined()
  })
})

describe('profile snapshots', () => {
  it('reads slot, GPU, and NIC selections from a saved profile', () => {
    const profile: ServerHardwareProfile = {
      cpuTemperature: { chip: 'coretemp', label: 'Package id 0' },
      gpuDevice: { chip: 'amdgpu', label: 'edge' },
      nicSlotDeviceIds: ['mac:eth0'],
    }
    expect(gpuDeviceSelectionFromProfile(profile)).toBe('amdgpu:edge')
    expect(snapshotFromProfile(profile)).toEqual({
      slots: {
        ...slotSelectionFromProfile(null),
        cpuTemperature: 'coretemp:Package id 0',
      },
      gpu: 'amdgpu:edge',
      nicSlots: ['mac:eth0'],
    })
  })

  it('starts empty when no profile has been saved yet', () => {
    expect(gpuDeviceSelectionFromProfile(undefined)).toBeNull()
    expect(snapshotFromProfile(null)).toEqual({
      slots: slotSelectionFromProfile(null),
      gpu: null,
      nicSlots: [],
    })
    expect(emptyTouchedSelection()).toEqual({
      slots: new Set(),
      gpu: false,
      nicSlots: false,
    })
  })
})
