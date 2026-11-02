import {
  ENVIRONMENT_CONFIRM_NAME_ERROR,
  ENVIRONMENT_RUNNING_ERROR,
  MANAGED_RUNTIME_PRESENT_ERROR,
} from '@/lib/instance-api'

export type EnvironmentDeleteFailure = Readonly<{
  text: string
  /** True when the user can fix it by stopping the environment first. */
  needsStop: boolean
}>

export const ENVIRONMENT_STOP_QUEUED_COPY =
  'Stop queued. Delete the environment again once it has stopped.'

/** What the confirm step says; names the environment so a wrong tab is obvious. */
export function environmentDeletePrompt(name: string): string {
  return `Delete "${name}" permanently? Its services, domains, containers and variables are removed.`
}

/** True when the control plane wants the environment's name typed before it deletes. */
export function environmentDeleteNeedsName(message: string): boolean {
  return message.includes(ENVIRONMENT_CONFIRM_NAME_ERROR)
}

/** Turn a refused delete into plain words and say whether Stop is the way out. */
export function environmentDeleteFailure(message: string, name: string): EnvironmentDeleteFailure {
  if (message.includes(ENVIRONMENT_RUNNING_ERROR)) {
    return {
      text: `"${name}" is still running or deploying. Stop it first, then delete it.`,
      needsStop: true,
    }
  }
  if (message.includes(MANAGED_RUNTIME_PRESENT_ERROR)) {
    return {
      text: `"${name}" still has a managed database on the server. Destroy it first.`,
      needsStop: false,
    }
  }
  return { text: message, needsStop: false }
}

/** What `useDeleteEnvironment` takes: the bare id, or the id with the typed name. */
export function environmentDeleteInput(
  id: string,
  confirmName?: string
): string | { id: string; confirmName: string } {
  return confirmName === undefined ? id : { id, confirmName }
}

/** What to do with a refused delete: ask for the name, show it, or show it inside the name dialog. */
export type EnvironmentDeleteOutcome =
  | Readonly<{ kind: 'ask-name' }>
  | Readonly<{ kind: 'failure'; failure: EnvironmentDeleteFailure }>
  | Readonly<{ kind: 'name-error'; text: string }>

export function environmentDeleteOutcome(
  message: string,
  name: string,
  confirmName?: string
): EnvironmentDeleteOutcome {
  if (confirmName === undefined && environmentDeleteNeedsName(message)) return { kind: 'ask-name' }
  const failure = environmentDeleteFailure(message, name)
  return confirmName === undefined
    ? { kind: 'failure', failure }
    : { kind: 'name-error', text: failure.text }
}
