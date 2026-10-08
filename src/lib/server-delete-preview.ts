import {
  formatBlockedDatabaseReason,
  type CappedPreviewList,
  type ServerDeleteBlocker,
  type ServerDeletePreview,
} from '@/lib/instance-api'
import { formatServerDeleteBlocker } from '@/lib/server-delete-blockers'

export const SERVER_DELETE_FORGET_COPY =
  'This host is offline. These records stay in the panel because the host can no longer remove them. Forgetting them only removes the records; it does not touch the machine.'

export const SERVER_DELETE_FORGET_REVEAL_LABEL = 'Host is gone'

export const SERVER_DELETE_FORGET_CONFIRM_LABEL = 'Forget these and delete server'

export const SERVER_DELETE_ENVIRONMENTS_LEAD =
  'These apps lived only on this server and will be removed from TurboPanel:'

export const SERVER_DELETE_MEMBERS_LEAD =
  'Extra copies of databases that still have a primary on another server will be forgotten:'

export type ForgottenResourceGroup = {
  heading: string
  names: string[]
  more: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCappedPreviewList(value: unknown): value is CappedPreviewList<unknown> {
  if (!isRecord(value) || !Array.isArray(value.items) || typeof value.more !== 'number') {
    return false
  }
  return Number.isFinite(value.more)
}

function cappedOrEmpty(value: unknown): CappedPreviewList<unknown> {
  if (isCappedPreviewList(value)) return value
  return { items: [], more: 0 }
}

function optionalCappedOk(value: unknown): boolean {
  return value === undefined || isCappedPreviewList(value)
}

function isBlocker(value: unknown): value is ServerDeleteBlocker {
  if (!isRecord(value) || typeof value.kind !== 'string' || typeof value.count !== 'number') {
    return false
  }
  return Number.isFinite(value.count)
}

export function isServerDeletePreview(value: unknown): value is ServerDeletePreview {
  if (!isRecord(value)) return false
  if (typeof value.online !== 'boolean') return false
  if (typeof value.canForget !== 'boolean') return false
  if (typeof value.colocated !== 'boolean') return false
  if (!Array.isArray(value.blockers)) return false
  if (!optionalCappedOk(value.environments)) return false
  if (!optionalCappedOk(value.members)) return false
  if (!optionalCappedOk(value.blockedDatabases)) return false
  return (
    isCappedPreviewList(value.containers) &&
    isCappedPreviewList(value.networks) &&
    isCappedPreviewList(value.ips)
  )
}

function containerLabel(container: unknown): string {
  if (!isRecord(container) || typeof container.name !== 'string') return ''
  let label = container.name
  const status = typeof container.status === 'string' ? container.status.trim() : ''
  if (status.length > 0) {
    label = `${label} (${status})`
  }
  const service = typeof container.serviceName === 'string' ? container.serviceName.trim() : ''
  if (service.length > 0) {
    label = `${label} · ${service}`
  }
  return label
}

function group(
  heading: string,
  names: string[],
  more: number
): ForgottenResourceGroup | null {
  if (names.length === 0 && more <= 0) return null
  return { heading, names, more }
}

function namesFromList(
  list: CappedPreviewList<unknown>,
  label: (item: unknown) => string
): string[] {
  return list.items.map(label).filter((name) => name.length > 0)
}

function environmentLabel(item: unknown): string {
  if (!isRecord(item) || typeof item.name !== 'string') return ''
  const project = typeof item.projectName === 'string' ? item.projectName.trim() : ''
  const name = item.name.trim()
  if (name.length === 0) return ''
  if (project.length === 0) return name
  return `${name} in ${project}`
}

function memberLabel(item: unknown): string {
  if (!isRecord(item) || typeof item.databaseName !== 'string') return ''
  return item.databaseName.trim()
}

export function joinCappedPlainList(labels: string[], more: number): string {
  const parts = [...labels]
  if (more > 0) parts.push(moreLabel(more))
  return parts.join(', ')
}

function sentenceForList(
  lead: string,
  list: CappedPreviewList<unknown>,
  label: (item: unknown) => string
): string | null {
  const names = namesFromList(list, label)
  const more = Math.max(0, list.more)
  if (names.length === 0 && more <= 0) return null
  return `${lead} ${joinCappedPlainList(names, more)}`
}

export function forgottenResourceGroups(preview: unknown): ForgottenResourceGroup[] {
  try {
    if (!isServerDeletePreview(preview)) return []
    const groups = [
      group(
        'Containers',
        namesFromList(preview.containers, containerLabel),
        Math.max(0, preview.containers.more)
      ),
      group(
        'Networks',
        namesFromList(preview.networks, (item) =>
          isRecord(item) && typeof item.name === 'string' ? item.name : ''
        ),
        Math.max(0, preview.networks.more)
      ),
      group(
        'Addresses',
        namesFromList(preview.ips, (item) =>
          isRecord(item) && typeof item.address === 'string' ? item.address : ''
        ),
        Math.max(0, preview.ips.more)
      ),
    ]
    return groups.filter((item): item is ForgottenResourceGroup => item !== null)
  } catch {
    return []
  }
}

export function environmentForgetCopy(preview: unknown): string | null {
  if (!isServerDeletePreview(preview)) return null
  return sentenceForList(
    SERVER_DELETE_ENVIRONMENTS_LEAD,
    cappedOrEmpty(preview.environments),
    environmentLabel
  )
}

export function membersForgetCopy(preview: unknown): string | null {
  if (!isServerDeletePreview(preview)) return null
  return sentenceForList(
    SERVER_DELETE_MEMBERS_LEAD,
    cappedOrEmpty(preview.members),
    memberLabel
  )
}

export function blockedDatabaseMessages(preview: unknown): string[] {
  if (!isServerDeletePreview(preview)) return []
  const list = cappedOrEmpty(preview.blockedDatabases)
  const lines: string[] = []
  for (const item of list.items) {
    if (!isRecord(item) || typeof item.name !== 'string' || typeof item.reason !== 'string') {
      continue
    }
    const name = item.name.trim()
    if (name.length === 0) continue
    lines.push(formatBlockedDatabaseReason(name, item.reason))
  }
  if (list.more > 0) {
    lines.push(moreLabel(list.more))
  }
  return lines
}

export function hasBlockedDatabases(preview: unknown): boolean {
  if (!isServerDeletePreview(preview)) return false
  const list = cappedOrEmpty(preview.blockedDatabases)
  return list.items.length > 0 || list.more > 0
}

export function serverDeleteBlockerMessages(preview: unknown): string[] {
  try {
    if (!isServerDeletePreview(preview) || preview.canForget) return []
    const lines: string[] = []
    for (const row of preview.blockers) {
      if (!isBlocker(row) || row.count < 1) continue
      const line = formatServerDeleteBlocker(row)
      if (line.length > 0) lines.push(line)
    }
    return lines
  } catch {
    return []
  }
}

export function moreLabel(count: number): string {
  return `and ${count} more`
}

export function shouldShowServerForgetPath(
  preview: unknown,
  options: Readonly<{ serverConnected: boolean }>
): boolean {
  try {
    if (!isServerDeletePreview(preview)) return false
    if (options.serverConnected) return false
    if (preview.online) return false
    if (hasBlockedDatabases(preview)) return false
    return preview.canForget
  } catch {
    return false
  }
}
