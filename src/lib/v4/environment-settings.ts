import { isDisplayNameTaken } from '@/lib/display-name'
import { validateEnvironmentName } from '@/lib/environment-validation'
import type { EnvironmentRecord, OrgServerRecord } from '@/lib/instance-api'
import { serverDisplayName } from '@/lib/resource-labels'

/** What is wrong with a new environment name, or null. Other environments of the project are checked too. */
export function environmentRenameProblem(
  name: string,
  environment: EnvironmentRecord,
  siblings: readonly EnvironmentRecord[],
): string | null {
  const trimmed = name.trim()
  const invalid = validateEnvironmentName(trimmed)
  if (invalid) return invalid
  const others = siblings.filter((sibling) => sibling.id !== environment.id).map((sibling) => sibling.name)
  return isDisplayNameTaken(trimmed, others) ? 'Another environment in this project already has that name.' : null
}

/** The PATCH body for a rename: the trimmed name, or null when unchanged or not valid (Save stays hidden). */
export function buildEnvironmentRenamePatch(
  name: string,
  environment: EnvironmentRecord,
  siblings: readonly EnvironmentRecord[],
): { name: string } | null {
  const trimmed = name.trim()
  if (trimmed === (environment.name ?? '').trim()) return null
  return environmentRenameProblem(trimmed, environment, siblings) ? null : { name: trimmed }
}

/** Where an environment runs, in words. */
export type EnvironmentServerFacts = Readonly<{
  /** The server's name, or null when no server is set. */
  server: string | null
  /** `pinned`: this environment has its own server. `project`: it uses the project's server. */
  source: 'pinned' | 'project' | 'none'
  /** The server is known and not connected right now. */
  offline: boolean
  /** The id that runs it (the pin, else the project's server), or null. */
  effectiveServerId: string | null
}>

export function environmentServerFacts(
  environment: EnvironmentRecord,
  projectServerId: string | null,
  servers: readonly OrgServerRecord[],
): EnvironmentServerFacts {
  const effectiveServerId = environment.serverId ?? projectServerId
  if (!effectiveServerId) {
    return { server: null, source: 'none', offline: false, effectiveServerId: null }
  }
  const row = servers.find((server) => server.id === effectiveServerId)
  return {
    server: row ? serverDisplayName(row) : 'A server that is no longer in this organization',
    source: environment.serverId ? 'pinned' : 'project',
    offline: row ? !row.connected : false,
    effectiveServerId,
  }
}

/** One server the environment can be moved to. `serverId: null` hands the choice back to the project's server. */
export type MoveChoice = Readonly<{ serverId: string | null; label: string; sub?: string }>

/**
 * Where an environment can move to: every connected server except the one it
 * already runs on, by name, plus "use the project's server" when it has its own
 * server and the project names a different one.
 */
export function serverMoveChoices(
  environment: EnvironmentRecord,
  projectServerId: string | null,
  servers: readonly OrgServerRecord[],
): readonly MoveChoice[] {
  const current = environment.serverId ?? projectServerId
  const choices: MoveChoice[] = servers
    .filter((server) => server.connected && server.id !== current)
    .map((server) => ({ serverId: server.id, label: serverDisplayName(server) }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const projectRow = servers.find((server) => server.id === projectServerId)
  if (environment.serverId && projectServerId && environment.serverId !== projectServerId) {
    choices.unshift({
      serverId: null,
      label: projectRow ? `Use the project's server (${serverDisplayName(projectRow)})` : "Use the project's server",
      sub: 'Stop giving this environment a server of its own.',
    })
  }
  return choices
}

/** The body of a move: `serverId` is the new pin, `null` clears it. */
export function buildServerMovePatch(choice: MoveChoice): { serverId: string | null } {
  return { serverId: choice.serverId }
}

/**
 * What the move confirmation says. A move changes only where the next deploy
 * runs: the control plane records the new server and does nothing else, so
 * the words say exactly that, never "migrates" or "transfers".
 */
export function serverMoveCopy(
  environmentName: string,
  from: string | null,
  to: MoveChoice,
): Readonly<{ title: string; lines: readonly string[]; confirm: string }> {
  const target = to.serverId === null ? "the project's server" : to.label
  const lines = [
    `This changes where the next deploy of ${environmentName} runs. It does not deploy anything now.`,
    'Nothing is copied: storage and databases stay where they are, and nothing is stopped.',
  ]
  if (from) lines.push(`What runs on ${from} keeps running there until you stop it.`)
  lines.push(`Deploy ${environmentName} afterwards to start it on ${target}.`)
  return { title: `Move ${environmentName} to ${target}?`, lines, confirm: 'Move' }
}
