/** Pure rules for the environment header "⋯" menu (no React). */

export const DESTROY_EXPLANATION =
  "Removes this environment's containers and their data volumes. The environment and its settings stay. Use Delete environment to remove the environment itself."

export const DESTROY_ARMED_HINT = `${DESTROY_EXPLANATION} Cannot be undone.`

export const LAST_ENVIRONMENT_REASON = 'A project needs at least one environment'

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
  }> = {},
): EnvironmentActionItem {
  return {
    id,
    label,
    hint: options.hint ?? null,
    tone: options.tone ?? 'default',
    disabledReason: options.disabledReason ?? null,
  }
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
  input: EnvironmentActionInput,
): readonly EnvironmentActionItem[] {
  const busyReason = input.busy ? BUSY_REASON : null
  const items: EnvironmentActionItem[] = [
    item('preview-merged', 'Preview merged compose', {
      hint: 'The Base combined with this environment’s changes',
      disabledReason: busyReason,
    }),
    item('preview-prepared', 'Preview prepared compose', {
      hint: 'Deploy-ready document after variables, naming and site split',
      disabledReason: busyReason,
    }),
  ]
  if (input.canMutate && input.hasContainers) {
    items.push(
      item('cacheless', 'Cacheless redeploy', {
        hint: 'Rebuilds images without the Docker build cache — slower',
        disabledReason: deployBlockReason(input),
      }),
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
      }),
    )
  }
  if (input.canOwn) {
    items.push(
      item('delete', 'Delete environment…', {
        tone: 'danger',
        disabledReason:
          input.environmentCount > 1 ? null : LAST_ENVIRONMENT_REASON,
      }),
    )
  }
  return items
}
