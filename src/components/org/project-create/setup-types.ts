/**
 * Shared vocabulary for the two places a project picks how it runs: the create
 * wizard (`project-create-section`) and resumable setup for projects that were
 * created empty before the wizard existed (`project/project-setup-section`).
 */

import type { CatalogSummary } from '@/lib/instance-api'
import {
  managedCatalogEntryForCode,
  sortManagedCatalogEntries,
} from '@/lib/managed-services'

export type SetupType = 'docker-compose' | 'template' | 'managed'

export type SetupTypeOption = {
  type: SetupType
  label: string
  description: string
}

export const SETUP_TYPE_OPTIONS: readonly SetupTypeOption[] = [
  {
    type: 'docker-compose',
    label: 'Compose',
    description: 'A blank slate for multiple services.',
  },
  {
    type: 'template',
    label: 'Template',
    description: 'Start from a catalog template with sensible defaults already wired up.',
  },
  {
    type: 'managed',
    label: 'Managed',
    description:
      'A service that is automatically set up for you. Provisioning, pooling, backups, and connections are handled.',
  },
]

/** Catalog rows a setup type offers, ordered for display. */
export function filterSetupCatalog(
  catalog: readonly CatalogSummary[],
  type: SetupType,
): CatalogSummary[] {
  if (type === 'template') {
    return catalog
      .filter((entry) => entry.kind === 'template')
      .toSorted((a, b) => a.displayName.localeCompare(b.displayName))
  }
  if (type === 'managed') {
    return sortManagedCatalogEntries(
      catalog.filter(
        (entry) =>
          entry.kind === 'managed' &&
          managedCatalogEntryForCode(entry.code) !== undefined,
      ),
    )
  }
  return []
}

/** Managed engines ship in waves — unreleased ones stay visible but unpickable. */
export function isCatalogEntrySelectable(
  entry: CatalogSummary,
  type: SetupType,
): boolean {
  if (type !== 'managed') return true
  return managedCatalogEntryForCode(entry.code)?.status === 'available'
}
