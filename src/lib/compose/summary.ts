import {
  normalizeCompose,
  type ComposeDocument,
} from './types'

function isPlainObjectMap(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Count plain-object map keys under a top-level compose key (services /
 * networks / volumes). Non-object / array values are ignored — same rule as
 * `servicesFrom` in the compose editor.
 */
function countMapKeys(document: ComposeDocument, key: string): number {
  const value = document.data[key]
  if (!isPlainObjectMap(value)) return 0
  let count = 0
  for (const entry of Object.values(value)) {
    if (isPlainObjectMap(entry)) count += 1
  }
  return count
}

export type ComposeDocumentSummary = {
  services: number
  networks: number
  volumes: number
}

export function summarizeComposeDocument(
  document: unknown,
): ComposeDocumentSummary {
  const normalized = normalizeCompose(document)
  return {
    services: countMapKeys(normalized, 'services'),
    networks: countMapKeys(normalized, 'networks'),
    volumes: countMapKeys(normalized, 'volumes'),
  }
}

function countLabel(count: number, noun: string): string {
  return count === 1 ? `1 ${noun}` : `${count} ${noun}s`
}

export type ComposeSummaryChip = {
  key: 'services' | 'networks' | 'volumes'
  label: string
}

/**
 * Singular/plural chip labels matching editor phrasing (`1 service` /
 * `2 services`). Zero-count sections are omitted.
 */
export function formatComposeSummaryChips(
  summary: ComposeDocumentSummary,
): ComposeSummaryChip[] {
  const chips: ComposeSummaryChip[] = []
  if (summary.services > 0) {
    chips.push({
      key: 'services',
      label: countLabel(summary.services, 'service'),
    })
  }
  if (summary.networks > 0) {
    chips.push({
      key: 'networks',
      label: countLabel(summary.networks, 'network'),
    })
  }
  if (summary.volumes > 0) {
    chips.push({
      key: 'volumes',
      label: countLabel(summary.volumes, 'volume'),
    })
  }
  return chips
}
