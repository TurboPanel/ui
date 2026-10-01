/** Pure rules for the environment Overview "More" menu (no React). */

export const DESTROY_EXPLANATION =
  "Removes this environment's containers and their data volumes. The environment and its settings stay. Use Delete environment to remove the environment itself."

export const DESTROY_ARMED_HINT = `${DESTROY_EXPLANATION} Cannot be undone.`

export const LAST_ENVIRONMENT_REASON = 'A project needs at least one environment'

export type EnvironmentMenuItem = Readonly<{
  id: 'settings' | 'delete'
  label: string
  /** Why the item cannot be used right now; the item stays visible. */
  disabledReason: string | null
}>

/**
 * Items for the "More" menu beside Destroy. Owners only: everyone else gets no
 * menu at all (the server enforces the same rule with a 403).
 */
export function environmentMenuItems(
  input: Readonly<{ canOwn: boolean; environmentCount: number }>
): readonly EnvironmentMenuItem[] {
  if (!input.canOwn) return []
  return [
    { id: 'settings', label: 'Environment settings', disabledReason: null },
    {
      id: 'delete',
      label: 'Delete environment…',
      disabledReason: input.environmentCount > 1 ? null : LAST_ENVIRONMENT_REASON,
    },
  ]
}
