import {
  formatServerDeleteBlockerLine,
  type CappedPreviewList,
  type ServerDeleteBlocker,
  type ServerDeletePreview,
} from '@/lib/instance-api'

export const SERVER_DELETE_FORGET_COPY =
  'This host is offline. These records stay in the panel because the host can no longer remove them. Forgetting them only removes the records; it does not touch the machine.'

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

export function serverDeleteBlockerMessages(preview: unknown): string[] {
  try {
    if (!isServerDeletePreview(preview) || preview.canForget) return []
    const lines: string[] = []
    for (const row of preview.blockers) {
      if (!isBlocker(row) || row.count < 1) continue
      lines.push(formatServerDeleteBlockerLine(row.kind, row.count))
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
    return preview.canForget
  } catch {
    return false
  }
}
