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
import type { ComposeProjectTabId } from '@/lib/project-navigation'

/** Project type stored on the row and sent to `POST /projects`. */
export type SetupType = 'docker-compose' | 'template' | 'managed'

/**
 * Card the operator picks. Compose and Services are the *same* project type —
 * they differ only in which tab of the compose surface you land on, so someone
 * who thinks in service cards never has to meet raw YAML first.
 */
export type SetupChoice = 'compose' | 'services' | 'template' | 'managed'

export type SetupTypeOption = {
  choice: SetupChoice
  type: SetupType
  label: string
  description: string
  /** Compose-surface tab this choice opens on. */
  section: ComposeProjectTabId
}

export const SETUP_TYPE_OPTIONS: readonly SetupTypeOption[] = [
  {
    choice: 'compose',
    type: 'docker-compose',
    label: 'Compose',
    description: 'A blank slate. You define the whole stack in YAML.',
    section: 'compose',
  },
  {
    choice: 'services',
    type: 'docker-compose',
    label: 'Services',
    description: 'The same stack, defined with service cards instead of YAML.',
    section: 'overview',
  },
  {
    choice: 'template',
    type: 'template',
    label: 'Template',
    description: 'A ready-made stack from the catalog.',
    section: 'overview',
  },
  {
    choice: 'managed',
    type: 'managed',
    label: 'Managed',
    description:
      'Fully configured on your own servers — provisioning, backups, and connections included.',
    section: 'overview',
  },
]

export function setupOptionForChoice(
  choice: SetupChoice,
): SetupTypeOption | undefined {
  return SETUP_TYPE_OPTIONS.find((option) => option.choice === choice)
}

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
