import type {
  InstanceUpdates,
  UpgradeActiveRunResponse,
  UpgradeRunRecord,
  UpgradeStepRow,
} from '@/lib/instance-api'
import {
  selfHostedUpdateAvailable,
  updatePieceLabel,
  updatePieces,
  type ConsoleBuild,
  type UpdatePiece,
} from '@/lib/instance-updates'
import { joinWithAnd } from '@/lib/upgrade-display'
import { plainStepFailureMessage } from '@/lib/user-error'

/**
 * Plain-language update status for the self-hosted Updates screen and the
 * update-available banner: why a run failed, when a run has gone quiet, and
 * whether (and for which build) to offer an update.
 */

export const UPGRADE_DOCS_URL = 'https://turbopanel.io/docs/deployment/upgrade'

/**
 * The installer host for an update channel: rc is `staging.`, the canary rail is
 * `testing.`, a release (or an unknown channel) the bare `turbopanel.sh`. Each
 * serves that environment's `run.sh`.
 */
export function installerHostForChannel(channel: string | null | undefined): string {
  switch (channel) {
    case 'rc':
      return 'staging.turbopanel.sh'
    case 'trunk':
    case 'edge':
    case 'canary':
      return 'testing.turbopanel.sh'
    default:
      return 'turbopanel.sh'
  }
}

/** Refreshes the co-located daemon in place (instance, UI and database untouched). */
export function daemonReinstallCommand(channel?: string | null): string {
  return `curl -fsSL ${installerHostForChannel(channel)} | TURBOPANEL_DAEMON_ONLY=1 sh`
}

export const DAEMON_LOGS_COMMAND = 'journalctl -u turbopaneld -n 100 --no-pager'

/** A step with no new stage for this long reads as "still waiting". */
export const UPGRADE_STALL_HINT_MS = 5 * 60 * 1000

/** Starting a run returns in well under a second; past this, stop the spinner. */
export const UPGRADE_START_TIMEOUT_MS = 30 * 1000

export type UpdateFailureExplanation = Readonly<{
  title: string
  body: string
  /** A command to run on the control-plane host, when one fixes it. */
  command: string | null
  docsUrl: string | null
}>

type FailureInput = Readonly<{
  errorCode?: string | null
  errorMessage?: string | null
}>

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}

/** Control-plane step failures that are not a rollback: the web server and an unconfirmed recovery. */
function explainControlPlaneFailure(
  code: string | null,
  message: string | null
): UpdateFailureExplanation | null {
  if (code === 'web_server_failed') {
    return {
      title: 'The web server did not start',
      body: 'The new control plane is running and healthy, but the web server in front of it did not start. Start it on the control-plane host, then reload this page.',
      command: 'sudo systemctl restart turbopanel-caddy',
      docsUrl: null,
    }
  }
  if (code === 'recovery_required') {
    return {
      title: 'The previous build could not be confirmed',
      body: `The new control plane did not become healthy and the automatic rollback could not be confirmed. Check whether the control plane is answering before running any recovery command.${
        message ? ` Details: ${message}` : ''
      }`,
      command: DAEMON_LOGS_COMMAND,
      docsUrl: UPGRADE_DOCS_URL,
    }
  }
  return null
}

/** Why a step failed, in words an operator can act on. */
export function explainUpgradeFailure(
  input: FailureInput,
  channel?: string | null
): UpdateFailureExplanation {
  const code = clean(input.errorCode)
  const message = plainStepFailureMessage(clean(input.errorMessage))
  const mentions = (pattern: RegExp) => message !== null && pattern.test(message)

  if (code === 'preflight_manifest' && mentions(/signature/i)) {
    return {
      title: "Can't verify the new release",
      body:
        "This server's TurboPanel can't verify the new release's signature. " +
        'Reinstall the daemon once to trust the current signing key: run this as root on the server, then try the update again.',
      command: daemonReinstallCommand(channel),
      docsUrl: UPGRADE_DOCS_URL,
    }
  }
  if (code === 'preflight_manifest') {
    return {
      title: "Couldn't read the release manifest",
      body: `The daemon couldn't load or verify this channel's release manifest.${
        message ? ` It said: ${message}` : ''
      }`,
      command: null,
      docsUrl: UPGRADE_DOCS_URL,
    }
  }
  if (code === 'preflight_disk') {
    return {
      title: 'Not enough disk space',
      body: 'The server does not have enough free disk space for the new build. Free some space, then retry.',
      command: null,
      docsUrl: null,
    }
  }
  if (code === 'preflight_in_progress') {
    return {
      title: 'Another update is already running',
      body: 'The server is still installing an earlier update. It will report when that finishes.',
      command: null,
      docsUrl: null,
    }
  }
  if (code === 'step_timeout') {
    return {
      title: 'The server stopped reporting progress',
      body: 'The server did not report progress, and the update stopped waiting. Check the daemon log on the server, then retry.',
      command: DAEMON_LOGS_COMMAND,
      docsUrl: null,
    }
  }
  if (code === 'server_offline') {
    return {
      title: 'The server was offline and was skipped',
      body: 'The server was offline, so this update skipped it. It will update on the first run after it reconnects.',
      command: null,
      docsUrl: null,
    }
  }
  if (code === 'dispatch_failed') {
    return {
      title: "The update couldn't reach the server",
      body: "The control plane could not deliver the update command to the server's daemon after several tries. Check that the server is online and connected, then retry.",
      command: null,
      docsUrl: null,
    }
  }
  const controlPlane = explainControlPlaneFailure(code, message)
  if (controlPlane) return controlPlane
  if (code === 'rolled_back' || code === 'update_rollback') {
    return {
      title: 'Rolled back to the previous build',
      body: `The new build did not come up healthy, so the previous one was restored.${
        message ? ` Reason: ${message}` : ''
      }`,
      command: DAEMON_LOGS_COMMAND,
      docsUrl: UPGRADE_DOCS_URL,
    }
  }
  return {
    title: 'The update failed',
    body: message ?? (code ? `Reason code: ${code}` : 'No reason was reported.'),
    command: DAEMON_LOGS_COMMAND,
    docsUrl: null,
  }
}

type RunWithSteps = UpgradeRunRecord & { steps: UpgradeStepRow[] }

const FAILED_RUN_STATUSES = new Set(['failed', 'partially_failed', 'cancelled'])
const FAILED_STEP_STATUSES = new Set(['failed', 'rolled_back', 'needs_attention'])

export type RunningBuild = Readonly<{ version?: string | null; commit?: string | null }>

function stepTargetIsRunning(step: UpgradeStepRow, running: RunningBuild): boolean {
  if (step.toCommit && running.commit) return step.toCommit === running.commit
  if (step.toVersion && running.version) return step.toVersion === running.version
  return false
}

/**
 * A finished run whose only failures are control-plane steps for the build
 * that is running now. The update did land (a false failure, for instance a
 * proxy that came back late), so a stale "failed" banner must not persist.
 */
export function failureSupersededByRunningBuild(
  run: RunWithSteps,
  running: RunningBuild | undefined
): boolean {
  if (!running) return false
  const failed = run.steps.filter((item) => FAILED_STEP_STATUSES.has(item.status))
  if (failed.length === 0) return false
  return failed.every(
    (item) => item.phase === 'control_plane' && stepTargetIsRunning(item, running)
  )
}

/**
 * The run the Updates screen should draw: the active one, else the last run
 * when it ended badly (the server keeps it for a day). A successful last run
 * is not drawn — the screen already says "up to date". A failed last run for
 * the build that is running now is not drawn either.
 */
export function runToShow(
  response: (Pick<UpgradeActiveRunResponse, 'run'> & { lastRun?: RunWithSteps | null }) | undefined,
  running?: RunningBuild
): { run: RunWithSteps | null; finished: boolean } {
  const active = response?.run ?? null
  if (active) return { run: active, finished: false }
  const last = response?.lastRun ?? null
  if (!last || !FAILED_RUN_STATUSES.has(last.status)) return { run: null, finished: false }
  if (failureSupersededByRunningBuild(last, running)) return { run: null, finished: false }
  return { run: last, finished: true }
}

/** What a failed step is called: its phase, or for a fleet step the server it ran on. */
function failedStepTitle(step: UpgradeStepRow): string {
  if (step.phase === 'colocated_daemon') return 'Daemon step'
  if (step.phase === 'control_plane') return 'Control plane step'
  return step.serverName ?? step.hostname ?? 'Server'
}

/** The first step that ended badly, with its explanation. */
export function runFailure(
  run: RunWithSteps | null
): (UpdateFailureExplanation & { stepTitle: string }) | null {
  if (!run) return null
  const step = run.steps.find((item) => FAILED_STEP_STATUSES.has(item.status))
  if (!step) {
    if (!FAILED_RUN_STATUSES.has(run.status)) return null
    if (run.status === 'cancelled') {
      return {
        title: 'The update was cancelled',
        body: 'Nothing else will be installed from this update.',
        command: null,
        docsUrl: null,
        stepTitle: 'Update',
      }
    }
    return { ...explainUpgradeFailure({ errorCode: run.error }, run.channel), stepTitle: 'Update' }
  }
  return { ...explainUpgradeFailure(step, run.channel), stepTitle: failedStepTitle(step) }
}

const WAITING_STATUSES = new Set([
  'pending',
  'waiting',
  'dispatched',
  'preparing',
  'downloading',
  'installing',
  'restarting',
  'verifying',
])

/**
 * "Still waiting" copy for an active step that has not reported a new stage
 * for {@link UPGRADE_STALL_HINT_MS}; null while it is moving (or finished).
 */
export function stallHint(
  step: (Pick<UpgradeStepRow, 'status'> & { lastStageAt?: string | null }) | null | undefined,
  nowMs: number
): string | null {
  if (!step || !WAITING_STATUSES.has(step.status)) return null
  const at = step.lastStageAt ? Date.parse(step.lastStageAt) : Number.NaN
  if (!Number.isFinite(at)) return null
  const quietMs = nowMs - at
  if (quietMs < UPGRADE_STALL_HINT_MS) return null
  const minutes = Math.floor(quietMs / 60_000)
  return `Still waiting — no progress reported for ${minutes} minutes. The control plane retries on its own; to see what the server is doing, check its daemon log (${DAEMON_LOGS_COMMAND}).`
}

/** Rejects with {@link UpgradeStartTimeoutError} when `work` outlives `ms`. */
export class UpgradeStartTimeoutError extends Error {
  constructor() {
    super('The update is taking longer than expected to start.')
    this.name = 'UpgradeStartTimeoutError'
  }
}

export async function withStartTimeout<T>(
  work: Promise<T>,
  ms: number = UPGRADE_START_TIMEOUT_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new UpgradeStartTimeoutError()), ms)
  })
  try {
    return await Promise.race([work, timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export type UpdateBanner = Readonly<{
  /** Identifies every offered build, so a new build of any piece shows the banner again. */
  key: string
  /** `Update available: control plane v0.1.5-canary.1, web app v0.1.5-canary.2` */
  title: string
  /** What Update does for exactly the pieces in the title. */
  body: string
}>

type UpdateOfferInput = Readonly<{
  updates: Pick<InstanceUpdates, 'units' | 'runtime' | 'updatesManaged'> | null | undefined
  activeRun: boolean
  /** This app's build, so a UI-only update counts as an offer. */
  consoleBuild?: ConsoleBuild | null
}>

/**
 * Whether a self-hosted control plane has an update on offer, dismissed or
 * not (the admin sidebar badge): the control plane or its daemon has an
 * update with a build to name, and no run is active.
 */
export function updateOffered(input: UpdateOfferInput): boolean {
  const updates = input.updates
  if (!updates || input.activeRun) return false
  if (updates.updatesManaged === true || updates.runtime === 'workers') return false
  if (!selfHostedUpdateAvailable(updates.units, input.consoleBuild ?? null)) return false
  return Boolean(
    updates.units.instance.target ?? updates.units.daemon.target ?? updates.units.instance.uiTarget
  )
}

/** How the banner body names each piece. */
const BODY_NAMES: Readonly<Record<UpdatePiece['name'], string>> = {
  'control plane': 'the control plane',
  'web app': 'the web app',
  daemon: 'the daemon on every server',
}

function pieceKey(piece: UpdatePiece): string {
  const { channel, version, commit, buildId } = piece.target
  return [piece.name, channel, version, commit, buildId].map((part) => part ?? '').join('|')
}

/**
 * The update-available banner for a self-hosted control plane: shown when an
 * update is on offer and these builds were not dismissed. It names each piece
 * that has an update with its own version.
 */
export function updateBanner(
  input: UpdateOfferInput &
    Readonly<{
      dismissedKey: string | null
      /** This app's build, so the web app is listed when the channel serves a newer one. */
      consoleBuild?: ConsoleBuild | null
    }>
): UpdateBanner | null {
  if (!input.updates || !updateOffered(input)) return null
  const pieces = updatePieces(input.updates.units, input.consoleBuild ?? null)
  if (pieces.length === 0) return null
  const key = pieces.map(pieceKey).join(';')
  if (key === input.dismissedKey) return null
  const labels = pieces.map(updatePieceLabel).join(', ')
  const names = joinWithAnd(pieces.map((piece) => BODY_NAMES[piece.name]))
  return {
    key,
    title: `Update available: ${labels}`,
    body: `Updates ${names} together.`,
  }
}

const DISMISS_KEY = 'turbopanel.update-banner.dismissed'

/** The dismissed build key, or null when storage is unavailable. */
export function readDismissedUpdateBanner(
  storage: Pick<Storage, 'getItem'> | undefined
): string | null {
  try {
    return storage?.getItem(DISMISS_KEY) ?? null
  } catch {
    return null
  }
}

export function writeDismissedUpdateBanner(
  storage: Pick<Storage, 'setItem'> | undefined,
  key: string
): void {
  try {
    storage?.setItem(DISMISS_KEY, key)
  } catch {
    // Private windows and blocked storage: the banner just comes back.
  }
}

/** Path that opens the Updates screen with the update confirmation already up. */
export const UPDATE_NOW_HREF = '/admin/updates?update=1'
