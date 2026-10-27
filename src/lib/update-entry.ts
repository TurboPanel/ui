import { adminAreaHref } from '@/lib/admin-navigation'
import type { InstanceUpdates } from '@/lib/instance-api'
import type { ConsoleBuild } from '@/lib/instance-updates'
import { updateOffered } from '@/lib/update-status'

/**
 * The update entry beside the version in the sidebar: when instance admins
 * see an update icon, what it says, and where a click on the version goes.
 * Updates run on their own; the icon only tells an instance admin that one is
 * waiting or that updates are paused. Organization managers and members never
 * see it and always get the versions popup.
 */

/**
 * The fleet-wide update facts the control plane will report for the automatic
 * update system: a connected daemon is behind its channel build, and updates
 * are paused by an admin. No control plane sends them yet (the fields are
 * optional on `InstanceUpdates`); this is the one place that reads them, so
 * the panel work only has to fill these fields.
 */
export function fleetUpdateSignals(
  updates: InstanceUpdates | null | undefined
): Readonly<{ daemonsBehind: boolean; paused: boolean }> {
  return {
    daemonsBehind: updates?.daemonsBehind === true,
    paused: updates?.updatesPaused === true,
  }
}

/**
 * An instance admin has something to look at: updates are paused, or an
 * update is waiting. Waiting means, on self-hosted, the control plane, this
 * web interface or the co-located daemon is behind its channel build (the
 * same offer the update banner makes), or, on both editions, any connected
 * daemon is behind ({@link fleetUpdateSignals}). A waiting update does not
 * count while an update run is already going.
 */
export function instanceAdminUpdatePending(
  input: Readonly<{
    updates: InstanceUpdates | null | undefined
    activeRun: boolean
    consoleBuild: ConsoleBuild | null
  }>
): boolean {
  if (!input.updates) return false
  const signals = fleetUpdateSignals(input.updates)
  if (signals.paused) return true
  if (input.activeRun) return false
  return signals.daemonsBehind || updateOffered(input)
}

/**
 * Whether the update icon shows, and the word beside it (live builds only).
 * Nothing until the version is known: the entry is not pressable before
 * then, and an icon must never sit on an entry that cannot be pressed.
 */
export type UpdateIndicator = Readonly<{ icon: boolean; word: 'Update' | null }>

export function updateIndicator(
  input: Readonly<{ pending: boolean; live: boolean; versionKnown: boolean }>
): UpdateIndicator {
  if (!input.pending || !input.versionKnown) return { icon: false, word: null }
  return { icon: true, word: input.live ? 'Update' : null }
}

/** What a click on the version does. */
export type VersionClick =
  Readonly<{ kind: 'versions' }> | Readonly<{ kind: 'navigate'; href: `/${string}` }>

/**
 * An instance admin with something pending goes to Admin > Updates; every
 * other click opens the versions popup.
 */
export function versionClick(
  input: Readonly<{ isInstanceAdmin: boolean; pending: boolean }>
): VersionClick {
  if (input.isInstanceAdmin && input.pending) {
    return { kind: 'navigate', href: adminAreaHref('updates') }
  }
  return { kind: 'versions' }
}

/** What a screen reader hears for the version entry. */
export function versionEntryAccessibilityLabel(
  input: Readonly<{
    version: string | null
    environment: string | null
    pending: boolean
    click: VersionClick
  }>
): string {
  const parts = [`Control plane ${input.version ?? 'version'}`]
  if (input.environment) parts.push(`${input.environment} build`)
  if (input.pending) parts.push('update notice')
  parts.push(input.click.kind === 'versions' ? 'show versions' : 'open Updates')
  return parts.join(', ')
}
