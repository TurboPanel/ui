import {
  isControlPlaneRestartError,
  RECOVERY_INTERVAL_MS,
  waitForControlPlaneRecovery,
} from '@/lib/control-plane-recovery'
import type { InstanceUpdates, InstanceUpdateTarget } from '@/lib/instance-api'
import { upgradeBuildVersionLabel } from '@/lib/upgrade-display'

/**
 * Legacy per-unit wait ceiling. Platform upgrades prefer
 * `waitForUpgradeRunSettlement` in `upgrade-run-poll.ts`.
 */
export const INSTANCE_UPDATE_WAIT_MS = 10 * 60 * 1000

export type InstalledIdentity = {
  version: string | null
  commit: string | null
}

/** Manifest identity. Commit wins over version so a canary rebuild is a new target. */
export type UpdateTargetIdentity = {
  version: string | null
  commit: string | null
  buildId?: string | null
}

export type UnitUpdateWait = { kind: 'applied' } | { kind: 'reconnected' } | { kind: 'unreachable' }

export function installedIdentity(installed: InstalledIdentity): string {
  return `${installed.version ?? ''}:${installed.commit ?? ''}`
}

/** One unit of `GET /instance/updates`, as far as update availability needs it. */
export type UpdateUnitView = Readonly<{
  installed: InstalledIdentity | null
  target: Readonly<{ commit?: string | null }> | null
  /** The server's answer. Absent only on a control plane older than the field. */
  updateAvailable?: boolean
}>

/**
 * Whether a unit has an update. The server's `updateAvailable` is the answer;
 * an older control plane is read by the server's own rule — the target names
 * a commit the unit is not running — never by comparing version strings.
 */
export function unitUpdateAvailable(unit: UpdateUnitView): boolean {
  if (typeof unit.updateAvailable === 'boolean') return unit.updateAvailable
  const want = presentIdentity(unit.target?.commit)
  if (!want || !unit.installed) return false
  return presentIdentity(unit.installed.commit) !== want
}

/** Either platform unit (control plane or co-located daemon) has an update. */
export function platformUpdateAvailable(
  units: Readonly<{
    instance: UpdateUnitView
    daemon: UpdateUnitView
  }>
): boolean {
  return unitUpdateAvailable(units.instance) || unitUpdateAvailable(units.daemon)
}

/** This console's own build (the bundle the control plane serves). */
export type ConsoleBuild = Readonly<{ version: string; commit: string }>

/** Whether the console bundle differs from the one the channel serves; `null` when either is unknown. */
export function consoleUpdateAvailable(
  consoleBuild: ConsoleBuild | null,
  uiTarget: Pick<InstanceUpdateTarget, 'commit'> | null | undefined
): boolean | null {
  const want = uiTarget?.commit?.trim()
  const have = consoleBuild?.commit.trim()
  if (!want || want === 'unknown' || !have) return null
  return !(want.startsWith(have) || have.startsWith(want))
}

/** A piece of TurboPanel that has an update, and the build it would move to. */
export type UpdatePiece = Readonly<{
  name: 'control plane' | 'UI' | 'daemon'
  target: InstanceUpdateTarget
}>

/**
 * The pieces that have an update, always in the order control plane, UI,
 * daemon. Each versions on its own, so each carries its own target. The
 * daemon counts only while it is connected; a piece with no target to name
 * is left out.
 */
export function updatePieces(
  units: InstanceUpdates['units'],
  consoleBuild: ConsoleBuild | null
): UpdatePiece[] {
  const { instance, daemon } = units
  const pieces: UpdatePiece[] = []
  if (instance.target && unitUpdateAvailable(instance)) {
    pieces.push({ name: 'control plane', target: instance.target })
  }
  if (instance.uiTarget && consoleUpdateAvailable(consoleBuild, instance.uiTarget)) {
    pieces.push({ name: 'UI', target: instance.uiTarget })
  }
  if (daemon.target && daemon.connected && unitUpdateAvailable(daemon)) {
    pieces.push({ name: 'daemon', target: daemon.target })
  }
  return pieces
}

/** `control plane v0.1.5-canary.1`: the piece and the version it would move to. */
export function updatePieceLabel(piece: UpdatePiece): string {
  const version = upgradeBuildVersionLabel(piece.target) ?? 'a new build'
  return `${piece.name} ${version}`
}

function presentIdentity(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  if (trimmed === '' || trimmed === 'unknown') return null
  return trimmed
}

function updateLanded(
  installed: InstalledIdentity,
  target: UpdateTargetIdentity,
  before: string
): boolean {
  const commit = presentIdentity(target.commit)
  if (commit) return presentIdentity(installed.commit) === commit
  const buildId = presentIdentity(target.buildId)
  if (buildId) return presentIdentity(installed.commit) === buildId
  const version = presentIdentity(target.version)
  if (version) return installed.version === version
  return installedIdentity(installed) !== before
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

type ReadStep = { kind: 'answered'; installed: InstalledIdentity } | { kind: 'unreachable' }

function finishAtDeadline(answered: boolean): UnitUpdateWait {
  if (answered) return { kind: 'reconnected' }
  return { kind: 'unreachable' }
}

function pollDelay(now: () => number, deadline: number, intervalMs: number): number | null {
  const remaining = deadline - now()
  if (remaining <= 0) return null
  return Math.min(intervalMs, remaining)
}

function handleAnsweredStep(
  step: ReadStep,
  target: UpdateTargetIdentity,
  before: string
): { answered: boolean; done: UnitUpdateWait | null } {
  if (step.kind === 'unreachable') return { answered: false, done: step }
  if (updateLanded(step.installed, target, before)) {
    return { answered: true, done: { kind: 'applied' } }
  }
  return { answered: true, done: null }
}

/**
 * Poll an authenticated read until the installed version is the target, the
 * window closes, or the control plane cannot be reached.
 *
 * A successful read of the old version is not failure: the install is still
 * running. A restart-shaped error hands off to `waitForControlPlaneRecovery`
 * and then checks whether the new version answered.
 */
export async function waitForUnitUpdate({
  read,
  target,
  before,
  timeoutMs = INSTANCE_UPDATE_WAIT_MS,
  intervalMs = RECOVERY_INTERVAL_MS,
  sleep = defaultSleep,
  now = () => Date.now(),
}: Readonly<{
  read: () => Promise<InstalledIdentity>
  target: UpdateTargetIdentity
  before: string
  timeoutMs?: number
  intervalMs?: number
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}>): Promise<UnitUpdateWait> {
  const deadline = now() + timeoutMs
  let answered = false
  const poll = async (): Promise<UnitUpdateWait> => {
    if (now() >= deadline) return finishAtDeadline(answered)
    const step = await readInstalledOrRecover({
      read,
      deadline,
      intervalMs,
      sleep,
      now,
    })
    const handled = handleAnsweredStep(step, target, before)
    if (handled.done) return handled.done
    if (handled.answered) answered = true
    const pause = pollDelay(now, deadline, intervalMs)
    if (pause === null) return finishAtDeadline(answered)
    await sleep(pause)
    return poll()
  }
  return poll()
}

async function readInstalledOrRecover({
  read,
  deadline,
  intervalMs,
  sleep,
  now,
}: Readonly<{
  read: () => Promise<InstalledIdentity>
  deadline: number
  intervalMs: number
  sleep: (ms: number) => Promise<void>
  now: () => number
}>): Promise<ReadStep> {
  try {
    return { kind: 'answered', installed: await read() }
  } catch (err) {
    if (!isControlPlaneRestartError(err)) throw err
    const recovery = await waitForControlPlaneRecovery({
      probe: read,
      timeoutMs: Math.max(0, deadline - now()),
      intervalMs,
      sleep,
      now,
    })
    if (recovery.kind === 'unreachable') return { kind: 'unreachable' }
    return { kind: 'answered', installed: recovery.value }
  }
}

export function unitUpdateFeedback(
  unit: 'instance' | 'daemon',
  kind: UnitUpdateWait['kind']
): string {
  const name = unit === 'instance' ? 'Control plane' : 'Daemon'
  switch (kind) {
    case 'applied':
      return `${name} updated.`
    case 'reconnected':
      return `${name} is reachable, but the reported build has not changed yet.`
    case 'unreachable':
      return unit === 'instance'
        ? 'Lost contact with the control plane while it updated.'
        : 'Lost contact while the daemon updated.'
  }
}
