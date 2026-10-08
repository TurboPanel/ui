import type {
  ServerDeletePreview,
  ServerDeletePreviewContainer,
} from '@/lib/instance-api'

export const SERVER_DELETE_FORGET_COPY =
  'This host is offline. These records stay in the panel because the host can no longer remove them. Forgetting them only removes the records; it does not touch the machine.'

export type ForgottenResourceGroup = {
  heading: string
  names: string[]
  more: number
}

function containerLabel(container: ServerDeletePreviewContainer): string {
  const status = container.status.trim()
  const service = container.serviceName?.trim()
  let label = container.name
  if (status.length > 0) {
    label = `${label} (${status})`
  }
  if (service && service.length > 0) {
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

export function forgottenResourceGroups(
  preview: ServerDeletePreview
): ForgottenResourceGroup[] {
  const more = preview.more
  const groups = [
    group(
      'Containers',
      preview.containers.map((item) => containerLabel(item)),
      more?.containers ?? 0
    ),
    group(
      'Networks',
      preview.networks.map((item) => item.name),
      more?.networks ?? 0
    ),
    group(
      'Addresses',
      preview.ips.map((item) => item.address),
      more?.ips ?? 0
    ),
  ]
  return groups.filter((item): item is ForgottenResourceGroup => item !== null)
}

export function moreLabel(count: number): string {
  return `and ${count} more`
}

export function shouldShowServerForgetPath(
  preview: ServerDeletePreview | undefined,
  options: Readonly<{ serverConnected: boolean }>
): boolean {
  if (options.serverConnected) return false
  if (preview?.online === true) return false
  return preview?.canForget === true
}
