import { isServerUpdateActionHidden } from '@/lib/daemon-update-labels'
import type { InstanceUpdates, ServerUpdateStatus } from '@/lib/instance-api'
import type { ConsoleBuild } from '@/lib/instance-updates'
import { adminAreaHref } from '@/lib/admin-navigation'
import { orgAreaHref } from '@/lib/org-navigation'
import { updateOffered } from '@/lib/update-status'

/**
 * The update entry beside the version in the sidebar: who sees an update
 * icon, what it says, and where a click on the version goes.
 */

/**
 * Whether this viewer may start daemon updates for an organization's
 * servers. Today that is the organization's owners and managers
 * (`organization:manage`, which instance admins also pass); the one place the
 * rule lives, so a dedicated privilege can replace it later. The control
 * plane enforces the same rule on its update routes.
 */
export function canUpdateOrgServers(input: Readonly<{ canManageOrganization: boolean }>): boolean {
  return input.canManageOrganization
}

/** Who is looking: an instance admin, someone who can update this organization's servers, or anyone else. */
export type UpdateViewer = 'instance-admin' | 'org-manager' | 'other'

export function updateViewer(
  input: Readonly<{ isInstanceAdmin: boolean; canUpdateOrgServers: boolean }>
): UpdateViewer {
  if (input.isInstanceAdmin) return 'instance-admin'
  return input.canUpdateOrgServers ? 'org-manager' : 'other'
}

/**
 * An instance admin has something to apply: on self-hosted the control plane,
 * this web interface or the co-located daemon is behind its channel build
 * (the same offer the update banner makes), and on both editions any
 * connected daemon is behind (`daemonsBehind`). Nothing while an update run
 * is already going.
 */
export function instanceAdminUpdatePending(
  input: Readonly<{
    updates: InstanceUpdates | undefined
    activeRun: boolean
    consoleBuild: ConsoleBuild | null
  }>
): boolean {
  if (!input.updates || input.activeRun) return false
  if (input.updates.daemonsBehind === true) return true
  return updateOffered(input)
}

/** The fields of a servers-list row the update rule reads. */
export type UpdatableServer = Readonly<{
  id: string
  connected: boolean
  colocatedWithInstance?: boolean
}>

/**
 * Whether an update can be started for this server now: it is connected, not
 * updated together with the control plane, not refused by the control plane,
 * its target build is known and newer, and no update is already starting or
 * running. The Servers page's Update actions and the sidebar's update icon
 * both use this, so the icon never sends someone to a page with no button.
 */
export function isServerUpdatable(
  server: UpdatableServer,
  update: ServerUpdateStatus | null | undefined,
  starting = false
): boolean {
  return (
    server.connected &&
    server.colocatedWithInstance !== true &&
    update?.colocatedWithInstance !== true &&
    !isServerUpdateActionHidden(update) &&
    update?.targetStatus === 'ok' &&
    update.updateAvailable === true &&
    !starting &&
    update.status !== 'updating'
  )
}

/** Update status rows by server id. */
export function indexUpdatesByServerId(
  entries: readonly ServerUpdateStatus[] | null | undefined
): Map<string, ServerUpdateStatus> {
  const map = new Map<string, ServerUpdateStatus>()
  for (const entry of entries ?? []) map.set(entry.serverId, entry)
  return map
}

/**
 * Someone who can update the organization's servers has something to apply:
 * one of its servers passes {@link isServerUpdatable}.
 */
export function orgServersUpdatePending(
  servers: readonly UpdatableServer[] | null | undefined,
  updates: readonly ServerUpdateStatus[] | null | undefined
): boolean {
  const byId = indexUpdatesByServerId(updates)
  return (servers ?? []).some((server) => isServerUpdatable(server, byId.get(server.id)))
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
 * Nothing to apply: the versions popup. Something to apply: an instance admin
 * goes to Admin > Updates, someone who can update the organization's servers
 * goes to that organization's Servers page.
 */
export function versionClick(
  input: Readonly<{ viewer: UpdateViewer; pending: boolean; orgId: string | null | undefined }>
): VersionClick {
  if (!input.pending) return { kind: 'versions' }
  if (input.viewer === 'instance-admin') return { kind: 'navigate', href: adminAreaHref('updates') }
  const orgId = input.orgId?.trim()
  if (input.viewer === 'org-manager' && orgId) {
    return { kind: 'navigate', href: orgAreaHref(orgId, 'servers') }
  }
  return { kind: 'versions' }
}

/** Whether this viewer has an update to apply, from the reads their role allows. */
export function viewerUpdatePending(
  input: Readonly<{
    viewer: UpdateViewer
    adminPending: boolean
    servers: readonly UpdatableServer[] | null | undefined
    updates: readonly ServerUpdateStatus[] | null | undefined
  }>
): boolean {
  if (input.viewer === 'instance-admin') return input.adminPending
  if (input.viewer === 'org-manager') return orgServersUpdatePending(input.servers, input.updates)
  return false
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
  if (input.pending) parts.push('update available')
  if (input.click.kind === 'versions') parts.push('show versions')
  else if (input.click.href.startsWith('/admin/')) parts.push('open Updates')
  else parts.push('open Servers')
  return parts.join(', ')
}
