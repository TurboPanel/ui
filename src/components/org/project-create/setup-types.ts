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
 * Card the operator picks. Compose, Services, and Git repository are the *same*
 * project type — they differ only in what the compose draft starts as and which
 * tab of the compose surface you land on, so someone who thinks in service
 * cards (or in repositories) never has to meet raw YAML first.
 */
export type SetupChoice =
  | 'compose'
  | 'services'
  | 'repository'
  | 'hosting'
  | 'template'
  | 'managed'

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
    description: 'A blank slate. Write or paste YAML and run any containers.',
    section: 'compose',
  },
  {
    choice: 'services',
    type: 'docker-compose',
    label: 'Service forms',
    description: 'The same setup, built with service forms instead of YAML.',
    section: 'services',
  },
  {
    // Third `docker-compose` card. Linking a repository is a create-time act,
    // not something to discover later inside a service form, so it sits with
    // the other two compose lenses rather than after the catalog cards. It must
    // stay *after* Compose: a bare `?type=docker-compose` resolves to the first
    // card offering that type, and that has always meant the blank YAML slate.
    choice: 'repository',
    type: 'docker-compose',
    label: 'From a Git repository',
    description: "Build and run code from a repository you've connected.",
    section: 'services',
  },
  {
    // Fourth `docker-compose` card, and the one an operator moving a WordPress
    // or plain-PHP site reaches for. It sits with the other compose lenses
    // rather than off on its own, because a site *is* a compose service — the
    // format just declares almost nothing for it.
    //
    // Still after Compose, for the same reason Repository is: a bare
    // `?type=docker-compose` resolves to the first card offering that type, and
    // that has always meant the blank YAML slate.
    choice: 'hosting',
    type: 'docker-compose',
    label: 'Hosting upload',
    // No mention of "traditional", "legacy", or "classic". This describes a
    // capability, and it is one a very large share of the web actually uses.
    description:
      'A directory and an account. Upload over SFTP and serve it: static, PHP, or WordPress.',
    section: 'services',
  },
  {
    choice: 'template',
    type: 'template',
    label: 'Template',
    description: 'A ready-made setup from the catalog.',
    section: 'services',
  },
  {
    choice: 'managed',
    type: 'managed',
    label: 'Managed database',
    description: 'Set up on your own servers, with backups and connection details.',
    section: 'overview',
  },
]

/**
 * The new-project screen shows three cards up front and keeps the other three
 * one press away under "More ways to start". Display order only: the list
 * above keeps Compose first for `?type=docker-compose`.
 */
export const MAIN_SETUP_CHOICES: readonly SetupChoice[] = [
  'repository',
  'compose',
  'managed',
]
export const MORE_SETUP_CHOICES: readonly SetupChoice[] = [
  'hosting',
  'template',
  'services',
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

/** Managed engines ship in waves — only released (`available`) ones are pickable. */
export function isCatalogEntrySelectable(
  entry: CatalogSummary,
  type: SetupType,
): boolean {
  if (type !== 'managed') return true
  return managedCatalogEntryForCode(entry.code)?.status === 'available'
}
