/**
 * The terminal command that reproduces a sensor reading, so an operator can
 * confirm a chart against the host itself.
 *
 * One rule matters here: **never hand out an `/sys/class/hwmon/hwmonN` path
 * as the command.** That numbering is assigned in device-probe order and is
 * not stable across reboots, so a command copied today can read a different
 * chip tomorrow. Everything below resolves by chip name or by device node,
 * both of which are stable. The raw path is still offered separately, with
 * that caveat attached, because it is the fastest way to check one value.
 */

export type SensorCommand = {
  /** What the command answers, e.g. "Composite temperature straight from the drive". */
  label: string
  command: string
}

/** Chip names the kernel gives NVMe and SATA temperature sources. */
const NVME_DEVICE_RE = /^(nvme\d+)n\d+$/
const SATA_DEVICE_RE = /^sd[a-z]+$/

/**
 * `nvme0n1` names a namespace; `nvme-cli` and `smartctl` want the controller
 * (`nvme0`). Falls back to the input when it isn't a namespace name.
 */
function nvmeControllerFor(chip: string): string {
  return NVME_DEVICE_RE.exec(chip)?.[1] ?? chip
}

/**
 * Commands for one signal, most direct first.
 *
 * `component` and `chip` come from the topology inventory — the daemon has
 * always resolved both, and v5 carries them through to the client so this
 * does not have to guess from a label string.
 */
export function sensorCommandsFor(signal: {
  signalId: string
  kind: string
  component: string
  chip: string
  label: string
}): SensorCommand[] {
  const { component, chip, label } = signal
  const commands: SensorCommand[] = []

  // Entity-joined signals (`gpu`, `drive`) have no hwmon file behind them: a
  // GPU's readings come from NVML/DCGM/sysfs-DRM, and a drive's whole-drive
  // temperature is derived from its own probes — which are still listed
  // individually as `component: 'disk'` signals with real commands. Offering
  // a `sensors '<chip>-*'` line here would print a chip name that does not
  // exist on the host.
  if (component === 'gpu' || component === 'drive') return commands

  if (component === 'disk' && NVME_DEVICE_RE.test(chip)) {
    const controller = nvmeControllerFor(chip)
    commands.push(
      {
        label: 'Composite temperature, straight from the drive',
        command: `sudo nvme smart-log /dev/${controller} | grep -i '^temperature'`,
      },
      {
        label: 'Every sensor this drive exposes',
        command: `sudo smartctl -A /dev/${controller}`,
      },
      { label: 'Via hwmon, resolved by chip name', command: `sensors 'nvme-pci-*'` }
    )
    return commands
  }

  if (component === 'disk' && SATA_DEVICE_RE.test(chip)) {
    commands.push(
      { label: 'Drive temperature', command: `sudo smartctl -A /dev/${chip} | grep -i temperature` },
      {
        label: 'Load the kernel module hwmon needs for SATA temperatures',
        command: 'sudo modprobe drivetemp',
      }
    )
    return commands
  }

  if (component === 'cpu' && signal.kind === 'power') {
    commands.push({
      label: 'RAPL energy counter (microjoules, cumulative — sample twice and divide)',
      command: 'cat /sys/class/powercap/intel-rapl:0/energy_uj',
    })
    return commands
  }

  if (component === 'cpu') {
    commands.push({
      label: 'CPU package and per-core temperatures',
      command: chip ? `sensors ${chip}-*` : 'sensors coretemp-isa-0000',
    })
    return commands
  }

  commands.push({
    label: 'All readings from this chip',
    command: chip ? `sensors '${chip}-*'` : `sensors | grep -A20 -i '${label}'`,
  })
  return commands
}

/**
 * The exact sysfs file behind a reading. Offered as a secondary command with
 * an explicit warning, since `hwmonN` numbering changes across reboots.
 */
export function sensorRawPathCommand(path: string | undefined): SensorCommand | null {
  if (!path) return null
  return {
    label: 'Current sysfs path — hwmon numbering changes across reboots',
    command: `cat ${path}`,
  }
}

/**
 * Operator-facing chart title: the kernel label, attributed to the hardware
 * it came from.
 *
 * The kernel's own NVMe labels are `Composite` and `Sensor 1`…`Sensor 8`
 * (`drivers/nvme/host/hwmon.c`), which say nothing about *which* drive on a
 * two-drive host — and `drivetemp` exposes no label at all, so a SATA disk
 * arrives as the literal `temp1`. Prefixing the resolved chip fixes both.
 */
export function attributedSignalTitle(signal: {
  signalId: string
  kind: string
  component: string
  chip: string
  label: string
}): string {
  const { component, chip, label } = signal
  if (component !== 'disk' || !chip) return label || signal.signalId
  // `drivetemp` has no `tempN_label` file, so the discovery layer falls back
  // to the raw attribute name.
  const readable = /^temp\d+$/.test(label) ? 'Drive temperature' : label
  return `${chip} · ${readable}`
}

/**
 * Whether a signal is the NVMe composite reading — the drive-level
 * temperature the NVMe spec defines and the one the drive throttles on, as
 * opposed to an individual internal probe.
 */
export function isNvmeCompositeSignal(signal: { component: string; label: string }): boolean {
  return signal.component === 'disk' && signal.label === 'Composite'
}

/**
 * Signal identity for a GPU-owned physical reading, mirroring the daemon's
 * `topology/hardware-signal-topology.ts` `gpuSignalId`. GPU temperature,
 * memory temperature, and power are `hardware.physical` signals keyed to the
 * owning GPU, not `gpu`-family fields, so a surface that wants them for a
 * specific GPU (rather than rendering the signal catalog generically) has to
 * build the id. Never parse one of these apart: a `gpuId` is opaque and may
 * itself contain a `:`.
 */
export function gpuSignalId(
  gpuId: string,
  kind: 'temperature' | 'memory-temperature' | 'power'
): string {
  return `signal:gpu:${gpuId}:${kind}`
}
