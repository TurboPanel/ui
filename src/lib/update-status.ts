import type {
  InstanceUpdates,
  UpgradeActiveRunResponse,
  UpgradeRunRecord,
  UpgradeStepRow,
} from '@/lib/instance-api'
import { platformUpdateAvailable } from '@/lib/instance-updates'
import { formatUpgradeBuildDisplayName } from '@/lib/upgrade-display'

/**
 * Plain-language update status for the self-hosted Updates screen and the
 * update-available banner: why a run failed, when a run has gone quiet, and
 * whether (and for which build) to offer an update.
 */

export const UPGRADE_DOCS_URL = 'https://turbopanel.io/docs/deployment/upgrade'

/** Refreshes the co-located daemon in place (instance, UI and database untouched). */
export const DAEMON_REINSTALL_COMMAND = 'curl -fsSL turbopanel.sh | TURBOPANEL_DAEMON_ONLY=1 sh'

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

/** Why a step failed, in words an operator can act on. */
export function explainUpgradeFailure(input: FailureInput): UpdateFailureExplanation {
  const code = clean(input.errorCode)
  const message = clean(input.errorMessage)
  const mentions = (pattern: RegExp) => message !== null && pattern.test(message)

  if (code === 'preflight_manifest' && mentions(/signature/i)) {
    return {
      title: "Can't verify the new release",
      body:
        "This server's TurboPanel can't verify the new release's signature. " +
        'Reinstall the daemon once to trust the current signing key: run this as root on the server, then try the update again.',
      command: DAEMON_REINSTALL_COMMAND,
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
      body: 'No progress for 15 minutes, three times over. Check the daemon log on the server, then retry.',
      command: DAEMON_LOGS_COMMAND,
      docsUrl: null,
    }
  }
  if (code === 'server_offline') {
    return {
      title: 'The server went offline',
      body: 'It was offline for over an hour, so the update stopped waiting. Bring it back online, then retry.',
      command: null,
      docsUrl: null,
    }
  }
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

/**
 * The run the Updates screen should draw: the active one, else the last run
 * when it ended badly (the server keeps it for a day). A successful last run
 * is not drawn — the screen already says "up to date".
 */
export function runToShow(
  response: (Pick<UpgradeActiveRunResponse, 'run'> & { lastRun?: RunWithSteps | null }) | undefined
): { run: RunWithSteps | null; finished: boolean } {
  const active = response?.run ?? null
  if (active) return { run: active, finished: false }
  const last = response?.lastRun ?? null
  if (last && FAILED_RUN_STATUSES.has(last.status)) return { run: last, finished: true }
  return { run: null, finished: false }
}

/** What a failed step is called: its phase, or for a fleet step the server it ran on. */
function failedStepTitle(step: UpgradeStepRow): string {
  if (step.phase === 'colocated_daemon') return 'Co-located daemon'
  if (step.phase === 'control_plane') return 'Control plane'
  return step.serverName ?? step.hostname ?? 'Fleet server'
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
        body: 'Nothing else will be installed from this run.',
        command: null,
        docsUrl: null,
        stepTitle: 'Upgrade',
      }
    }
    return { ...explainUpgradeFailure({ errorCode: run.error }), stepTitle: 'Upgrade' }
  }
  return { ...explainUpgradeFailure(step), stepTitle: failedStepTitle(step) }
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
  /** Identifies the offered build, so a dismissal hides only this one. */
  key: string
  title: string
}>

/**
 * The update-available banner for a self-hosted control plane: shown when an
 * update is available, no run is active, and this build was not dismissed.
 */
export function updateBanner(
  input: Readonly<{
    updates: Pick<InstanceUpdates, 'units' | 'runtime' | 'updatesManaged'> | null | undefined
    activeRun: boolean
    dismissedKey: string | null
  }>
): UpdateBanner | null {
  const updates = input.updates
  if (!updates || input.activeRun) return null
  if (updates.updatesManaged === true || updates.runtime === 'workers') return null
  if (!platformUpdateAvailable(updates.units)) return null
  const target = updates.units.instance.target ?? updates.units.daemon.target
  if (!target) return null
  const key = [target.channel, target.version, target.commit, target.buildId]
    .map((part) => part ?? '')
    .join('|')
  if (key === input.dismissedKey) return null
  return { key, title: `TurboPanel ${formatUpgradeBuildDisplayName(target)} is available` }
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
