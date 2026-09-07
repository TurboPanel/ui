import { describe, expect, it } from 'vitest'
import {
  attributedSignalTitle,
  isNvmeCompositeSignal,
  sensorCommandsFor,
  sensorRawPathCommand,
} from './sensor-commands'

const nvmeComposite = {
  signalId: 'signal:nvme0n1:Composite',
  kind: 'temperature',
  component: 'disk',
  chip: 'nvme0n1',
  label: 'Composite',
}

const nvmeSensor8 = { ...nvmeComposite, signalId: 'signal:nvme0n1:Sensor 8', label: 'Sensor 8' }

const sataDrive = {
  signalId: 'signal:sda:temp1',
  kind: 'temperature',
  component: 'disk',
  chip: 'sda',
  label: 'temp1',
}

const cpuTemp = {
  signalId: 'signal:coretemp:Package id 0',
  kind: 'temperature',
  component: 'cpu',
  chip: 'coretemp',
  label: 'CPU package temperature',
}

const cpuPower = { ...cpuTemp, signalId: 'signal:cpu:package-0', kind: 'power' }

describe('sensorCommandsFor', () => {
  it('addresses an NVMe drive by controller, not by namespace', () => {
    // `nvme0n1` is a namespace; nvme-cli and smartctl want `nvme0`.
    const commands = sensorCommandsFor(nvmeComposite)
    expect(commands[0]!.command).toContain('/dev/nvme0')
    expect(commands[0]!.command).not.toContain('nvme0n1')
  })

  it('offers the full per-sensor dump for a numbered NVMe probe', () => {
    expect(sensorCommandsFor(nvmeSensor8).map((c) => c.command)).toContain(
      'sudo smartctl -A /dev/nvme0'
    )
  })

  it('tells the operator to modprobe drivetemp for a SATA disk', () => {
    // Essentially no distribution autoloads it, so the reading is opt-in.
    expect(sensorCommandsFor(sataDrive).map((c) => c.command)).toContain('sudo modprobe drivetemp')
  })

  it('reads CPU power from the RAPL energy counter, not from sensors', () => {
    expect(sensorCommandsFor(cpuPower)[0]!.command).toContain('energy_uj')
  })

  it('resolves CPU temperature by chip name', () => {
    expect(sensorCommandsFor(cpuTemp)[0]!.command).toBe('sensors coretemp-*')
  })

  it('never emits a hwmonN path as a primary command, since that numbering is not boot-stable', () => {
    for (const signal of [nvmeComposite, nvmeSensor8, sataDrive, cpuTemp, cpuPower]) {
      for (const { command } of sensorCommandsFor(signal)) {
        expect(command).not.toMatch(/hwmon\d/)
      }
    }
  })

  it('falls back to a chip-scoped sensors call for an unclassified signal', () => {
    const commands = sensorCommandsFor({
      signalId: 'signal:nct6776:SYSTIN',
      kind: 'temperature',
      component: 'board',
      chip: 'nct6776',
      label: 'SYSTIN',
    })
    expect(commands[0]!.command).toBe("sensors 'nct6776-*'")
  })
})

describe('sensorRawPathCommand', () => {
  it('warns that hwmon numbering is not stable across reboots', () => {
    const raw = sensorRawPathCommand('/sys/class/hwmon/hwmon3/temp1_input')
    expect(raw?.command).toBe('cat /sys/class/hwmon/hwmon3/temp1_input')
    expect(raw?.label).toMatch(/reboots/i)
  })

  it('returns nothing when no path is known', () => {
    expect(sensorRawPathCommand(undefined)).toBeNull()
  })
})

describe('attributedSignalTitle', () => {
  it('names the drive a Composite reading belongs to', () => {
    // Two NVMe drives both report "Composite"; without the chip they are
    // indistinguishable in the chart list.
    expect(attributedSignalTitle(nvmeComposite)).toBe('nvme0n1 · Composite')
  })

  it('names the drive for a numbered internal probe too', () => {
    expect(attributedSignalTitle(nvmeSensor8)).toBe('nvme0n1 · Sensor 8')
  })

  it('rewrites drivetemp’s label-less temp1 into something readable', () => {
    expect(attributedSignalTitle(sataDrive)).toBe('sda · Drive temperature')
  })

  it('leaves non-disk signals on their operator-facing label', () => {
    expect(attributedSignalTitle(cpuTemp)).toBe('CPU package temperature')
  })

  it('falls back to the signal id when a label is missing entirely', () => {
    expect(
      attributedSignalTitle({
        signalId: 'signal:x:y',
        kind: 'temperature',
        component: 'board',
        chip: 'x',
        label: '',
      })
    ).toBe('signal:x:y')
  })
})

describe('isNvmeCompositeSignal', () => {
  it('identifies the drive-level composite reading', () => {
    expect(isNvmeCompositeSignal(nvmeComposite)).toBe(true)
  })

  it('does not treat an individual internal probe as the composite', () => {
    expect(isNvmeCompositeSignal(nvmeSensor8)).toBe(false)
  })
})
