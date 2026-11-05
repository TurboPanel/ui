import type { LicenseRecord, OrgServerRecord } from '@/lib/instance-api'
import type { StepRailState } from '@/lib/step-rail'

/**
 * The Add Server steps and what moves each one. Every step after the install
 * command advances from state the control plane already reports, polled by
 * the wizard through React Query, never from a timer:
 *
 * 1. Name: the form; in progress while the key is being made.
 * 2. Install Command: the one-shot command is on screen for the person to run.
 * 3. Run the Installer: the person said they ran it, and the control plane has
 *    heard nothing yet. The installer works on the host before the daemon
 *    ever talks to the control plane, so nothing finer is reported here.
 * 4. Enroll: the key's `provisioning` record is set (a daemon presented this
 *    key with a valid signature and its enrolment is under way).
 * 5. Connect: the key is bound to a server (`boundServer`, or a server row
 *    carries the key) that has not connected yet.
 * 6. Ready: the key list says the server connected; done once the server
 *    list shows it connected (when the wizard says so and offers Done).
 */
export type AddServerStepId = 'name' | 'command' | 'install' | 'enroll' | 'connect' | 'ready'

export const ADD_SERVER_STEPS: readonly Readonly<{ id: AddServerStepId; label: string }>[] = [
  { id: 'name', label: 'Name' },
  { id: 'command', label: 'Install Command' },
  { id: 'install', label: 'Run the Installer' },
  { id: 'enroll', label: 'Enroll' },
  { id: 'connect', label: 'Connect' },
  { id: 'ready', label: 'Ready' },
]

/** The wizard's own screens: the form, the install command, then the wait. */
export type AddServerScreen = 'create' | 'install' | 'waiting'

export type AddServerProgressInput = Readonly<{
  screen: AddServerScreen
  /** The key is being made right now. */
  creating: boolean
  /** The key made by this run, once there is one. */
  licenseId: string | null
  /** This org's keys, from the polled key list. */
  licenses?: readonly LicenseRecord[] | null
  /** This org's servers, from the polled server list. */
  servers?: readonly OrgServerRecord[] | null
  /** The wizard stopped checking (repeated failures or no access). */
  checkStopped?: boolean
}>

export type AddServerProgress = Readonly<{
  /** The step reached: every step before it is done. */
  reached: AddServerStepId
  /** True once the server list shows the server connected. */
  complete: boolean
  states: Readonly<Record<AddServerStepId, StepRailState>>
}>

/** How far the new server has come, from the wizard's screen and the polled lists. */
export function addServerProgress(input: AddServerProgressInput): AddServerProgress {
  const key = input.licenseId
    ? input.licenses?.find((license) => license.id === input.licenseId)
    : undefined
  const server = input.licenseId
    ? input.servers?.find((row) => row.licenseId === input.licenseId)
    : undefined
  const bound = key?.boundServer != null || server != null
  const connected = server?.connected === true || key?.boundServer?.connected === true
  const enrolling = key?.provisioning != null

  let reached: AddServerStepId = 'name'
  if (input.licenseId) reached = 'command'
  if (input.licenseId && input.screen === 'waiting') reached = 'install'
  if (enrolling) reached = 'enroll'
  if (bound) reached = 'connect'
  if (connected) reached = 'ready'
  // Done when the server list itself shows the server connected: the moment
  // the wizard says "Server connected" and offers Done.
  const complete = server?.connected === true

  const order = ADD_SERVER_STEPS.map((step) => step.id)
  const at = order.indexOf(reached)
  const states = {} as Record<AddServerStepId, StepRailState>
  for (const [index, id] of order.entries()) {
    if (index < at || (complete && index === at)) states[id] = 'done'
    else if (index > at) states[id] = 'pending'
    else states[id] = currentState(id, input)
  }
  return { reached, complete, states }
}

function currentState(id: AddServerStepId, input: AddServerProgressInput): StepRailState {
  if (id === 'name') return input.creating ? 'running' : 'active'
  if (id === 'command') return 'active'
  return input.checkStopped ? 'active' : 'running'
}

/** The line beside the spinner while the wizard waits for the new server. */
export function addServerWaitingLabel(
  reached: AddServerStepId,
  elapsedSeconds: number,
  enrollingHost: string | null
): string {
  const host = enrollingHost?.trim()
  switch (reached) {
    case 'enroll':
      return host
        ? `Enrolling ${host} (${elapsedSeconds}s)`
        : `Enrolling this host (${elapsedSeconds}s)`
    case 'connect':
      return `Enrolled; waiting for the server to connect (${elapsedSeconds}s)`
    case 'ready':
      return 'Connected; waiting for the server to report its details'
    default:
      return `Waiting for this host to connect (${elapsedSeconds}s)`
  }
}
