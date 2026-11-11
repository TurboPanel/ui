import type { ServiceOptions } from '@/lib/instance-api'

/**
 * A service save replaces the stored options on the control plane, so the
 * document sent must still hold everything the screen does not edit
 * (`instances`, keys a newer control plane added, and so on).
 *
 * Start from the stored options, drop the keys the screen edits, then write
 * the edited values for those keys. A key in `editedKeys` that `edited` leaves
 * out is cleared; any other stored key rides along unchanged.
 */
export function mergeEditedOptions(
  stored: ServiceOptions,
  edited: ServiceOptions,
  editedKeys: readonly (keyof ServiceOptions)[]
): ServiceOptions {
  const merged: ServiceOptions = { ...stored }
  for (const key of editedKeys) delete merged[key]
  for (const key of editedKeys) {
    if (edited[key] !== undefined) Object.assign(merged, { [key]: edited[key] })
  }
  return merged
}
