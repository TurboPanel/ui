import { confirmationName } from '@/lib/confirm-name'
import { ENVIRONMENT_RUNNING_ERROR, MANAGED_RUNTIME_PRESENT_ERROR } from '@/lib/instance-api'

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

/** The name typed to delete an environment: its name, else its id (the control plane's rule). */
export function environmentConfirmName(
  environment: Readonly<{ id: string; name?: string | null }>
): string {
  return confirmationName(environment.name, environment.id)
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

/**
 * Where a refused delete is shown: a running environment closes the name dialog
 * and shows the notice with Stop; anything else stays inside the dialog.
 */
export type EnvironmentDeleteOutcome =
  | Readonly<{ kind: 'failure'; failure: EnvironmentDeleteFailure }>
  | Readonly<{ kind: 'in-dialog'; text: string }>

export function environmentDeleteOutcome(message: string, name: string): EnvironmentDeleteOutcome {
  const failure = environmentDeleteFailure(message, name)
  return failure.needsStop
    ? { kind: 'failure', failure }
    : { kind: 'in-dialog', text: failure.text }
}
