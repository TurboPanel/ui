/**
 * Pure rules for the new-project screen: what the primary button does for
 * each card, and where the person lands once the project exists.
 */

import type { SetupChoice, SetupType } from '@/components/org/project-create/setup-types'
import { MORE_SETUP_CHOICES } from '@/components/org/project-create/setup-types'
import { projectEnvironmentSetupHref, projectHref } from '@/lib/project-navigation'

/**
 * What pressing the primary button does.
 *
 * - `create-from-repository`: the repository, branch and lane are all on this
 *   screen, so it creates the project and opens "Set up production".
 * - `open-compose`: Compose, Service forms and Hosting upload open the full
 *   Compose editor (the project's own screen) first; its Create button makes
 *   the project.
 * - `create-from-catalog`: a template or a managed database is created from
 *   the pick on this screen.
 */
export type PrimaryActionKind = 'create-from-repository' | 'open-compose' | 'create-from-catalog'

export type PrimaryAction = Readonly<{ kind: PrimaryActionKind | null; label: string }>

export function primaryActionForChoice(choice: SetupChoice | null): PrimaryAction {
  if (choice === 'repository') return { kind: 'create-from-repository', label: 'Continue' }
  if (choice === 'template' || choice === 'managed') {
    return { kind: 'create-from-catalog', label: 'Create project' }
  }
  if (choice === null) return { kind: null, label: 'Continue' }
  return { kind: 'open-compose', label: 'Continue' }
}

/** "More ways to start" opens by itself when a link already picked one of its cards. */
export function moreWaysOpenFor(choice: SetupChoice | null): boolean {
  return choice !== null && MORE_SETUP_CHOICES.includes(choice)
}

/**
 * Where a new project opens. A Compose project (every repository, Compose,
 * form or upload project) goes on to "Set up production", which fills in its
 * first environment. A template or managed database opens on the project,
 * whose own setup asks for what it needs.
 */
export function afterCreateHref(orgId: string, projectId: string, type: SetupType): string {
  return type === 'docker-compose'
    ? projectEnvironmentSetupHref(orgId, projectId)
    : projectHref(orgId, projectId)
}
