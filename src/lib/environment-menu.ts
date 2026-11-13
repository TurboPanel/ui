/** Pure rules for the environment header "⋯" menu (no React). */

export const DESTROY_EXPLANATION =
  "Removes this environment's containers. Its data volumes stay unless you choose to delete them too. The environment and its settings stay. Use Delete Environment to remove the environment itself."

export const DESTROY_ARMED_HINT = `${DESTROY_EXPLANATION} Cannot be undone.`

/** The Destroy choice to delete data as well; off every time Destroy is armed. */
export const DESTROY_DELETE_VOLUMES_LABEL = 'Also Delete the Data Volumes'

export const DESTROY_CONFIRM_NAME_LABEL = 'Environment Name'

/** What the typed-name field asks for. */
export function destroyConfirmNameHint(name: string): string {
  return `Type ${name} to delete its data volumes. Everything in them is gone for good.`
}

export const DESTROY_NO_VOLUMES_COPY = 'This environment has no data volumes to delete.'

export const DESTROY_VOLUMES_HEADING = 'These volumes and everything in them are deleted:'

export const DESTROY_KEPT_HEADING = 'These stay:'

/** Where a copy of a volume stays because the Destroy does not go to that server. */
export function destroyStaysOnCopy(names: readonly string[]): string | null {
  if (names.length === 0) return null
  return `A copy on ${names.join(', ')} stays.`
}

/** Why data cannot be deleted yet, naming the servers; null when every daemon can. */
export function destroyOutdatedServersCopy(names: readonly string[]): string | null {
  if (names.length === 0) return null
  return `Update the daemon on ${names.join(', ')} before deleting data volumes.`
}

/**
 * Whether Confirm Destroy may be pressed: always for a plain Destroy; with
 * data deletion, only once the list is loaded, every daemon can remove
 * volumes and the typed name matches exactly.
 */
export function destroyConfirmReady(
  input: Readonly<{
    deleteVolumes: boolean
    typedName: string
    expectedName: string
    volumesLoaded: boolean
    outdatedServerCount: number
  }>
): boolean {
  if (!input.deleteVolumes) return true
  return (
    input.volumesLoaded &&
    input.outdatedServerCount === 0 &&
    input.expectedName !== '' &&
    input.typedName === input.expectedName
  )
}

export const LAST_ENVIRONMENT_REASON = 'A project needs at least one environment'

export const PRIMARY_ENVIRONMENT_REASON =
  'The primary environment cannot be deleted. Make another one primary first'

export const BUSY_REASON = 'Wait for the current action to finish'

export const NO_SERVER_REASON = 'Set a server in Configuration first'

export const NO_LINUX_USER_REASON = 'Give each app a Linux user in Configuration first'

export type EnvironmentActionId =
  | 'preview-merged'
  | 'preview-prepared'
  | 'cacheless'
  | 'stop'
  | 'refresh'
  | 'settings'
  | 'destroy'
  | 'delete'

export type EnvironmentActionItem = Readonly<{
  id: EnvironmentActionId
  label: string
  /** One line under the label; null for none. */
  hint: string | null
  tone: 'default' | 'danger'
  /** Why the item cannot be used right now; the item stays visible. */
  disabledReason: string | null
}>

export type EnvironmentActionInput = Readonly<{
  /** Owners only: settings and delete (the server enforces the same rule). */
  canOwn: boolean
  /** Managers: anything that changes what runs. */
  canMutate: boolean
  environmentCount: number
  /** This is the project's primary environment. */
  isPrimary?: boolean
  hasServer: boolean
  needsPrincipal: boolean
  hasContainers: boolean
  isRunning: boolean
  busy: boolean
}>

function item(
  id: EnvironmentActionId,
  label: string,
  options: Readonly<{
    hint?: string
    tone?: 'default' | 'danger'
    disabledReason?: string | null
  }> = {}
): EnvironmentActionItem {
  return {
    id,
    label,
    hint: options.hint ?? null,
    tone: options.tone ?? 'default',
    disabledReason: options.disabledReason ?? null,
  }
}

function deleteBlockReason(input: EnvironmentActionInput): string | null {
  if (input.environmentCount <= 1) return LAST_ENVIRONMENT_REASON
  return input.isPrimary === true ? PRIMARY_ENVIRONMENT_REASON : null
}

function deployBlockReason(input: EnvironmentActionInput): string | null {
  if (input.busy) return BUSY_REASON
  if (!input.hasServer) return NO_SERVER_REASON
  if (input.needsPrincipal) return NO_LINUX_USER_REASON
  return null
}

/**
 * Items for the header "⋯" menu, in order. Everyone gets the previews and
 * Refresh; what changes the environment needs manage rights, and settings and
 * delete need ownership.
 */
export function environmentActionItems(
  input: EnvironmentActionInput
): readonly EnvironmentActionItem[] {
  const busyReason = input.busy ? BUSY_REASON : null
  const items: EnvironmentActionItem[] = [
    item('preview-merged', 'Preview Compose', {
      hint: 'The Base combined with this environment’s changes',
      disabledReason: busyReason,
    }),
    item('preview-prepared', 'Preview Deploy Summary', {
      hint: 'Which servers each service runs on and how it is reached',
      disabledReason: busyReason,
    }),
  ]
  if (input.canMutate && input.hasContainers) {
    items.push(
      item('cacheless', 'Cacheless redeploy', {
        hint: 'Rebuilds images without the Docker build cache — slower',
        disabledReason: deployBlockReason(input),
      })
    )
  }
  if (input.canMutate && input.hasContainers && input.isRunning) {
    items.push(item('stop', 'Stop', { disabledReason: busyReason }))
  }
  items.push(item('refresh', 'Refresh status', { disabledReason: busyReason }))
  if (input.canOwn) {
    items.push(item('settings', 'Environment settings'))
  }
  if (input.canMutate) {
    items.push(
      item('destroy', 'Destroy…', {
        hint: DESTROY_EXPLANATION,
        tone: 'danger',
        disabledReason: busyReason,
      })
    )
  }
  if (input.canOwn) {
    items.push(
      item('delete', 'Delete Environment…', {
        tone: 'danger',
        disabledReason: deleteBlockReason(input),
      })
    )
  }
  return items
}
