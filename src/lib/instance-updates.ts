import type { InstanceUpdates, InstanceUpdateTarget } from '@/lib/instance-api'
import { upgradeBuildVersionLabel } from '@/lib/upgrade-display'

export type InstalledIdentity = {
  version: string | null
  commit: string | null
}

function presentIdentity(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  if (trimmed === '' || trimmed === 'unknown') return null
  return trimmed
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

/**
 * Self-hosted: any of the control plane, the daemon or the UI has an update.
 * The UI ships inside the control-plane install, so a UI-only change is still
 * a run (and lights the button), even though the binary and daemon are current.
 */
export function selfHostedUpdateAvailable(
  units: Readonly<{
    instance: UpdateUnitView & Pick<InstanceUpdates['units']['instance'], 'uiTarget'>
    daemon: UpdateUnitView
  }>,
  consoleBuild: ConsoleBuild | null
): boolean {
  return (
    platformUpdateAvailable(units) ||
    consoleUpdateAvailable(consoleBuild, units.instance.uiTarget) === true
  )
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
  name: 'control plane' | 'web app' | 'daemon'
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
    pieces.push({ name: 'web app', target: instance.uiTarget })
  }
  if (daemon.target && daemon.connected && unitUpdateAvailable(daemon)) {
    pieces.push({ name: 'daemon', target: daemon.target })
  }
  return pieces
}

/** What each piece is called on screen. "App" already means a customer's own app. */
const PIECE_LABELS: Readonly<Record<UpdatePiece['name'], string>> = {
  'control plane': 'control plane',
  'web app': 'web interface',
  daemon: 'daemon',
}

/** `control plane v0.1.5-canary.1`: the piece and the version it would move to. */
export function updatePieceLabel(piece: UpdatePiece): string {
  const version = upgradeBuildVersionLabel(piece.target) ?? 'a new build'
  return `${PIECE_LABELS[piece.name]} ${version}`
}
