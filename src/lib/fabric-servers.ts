import type {
  FabricReconcileOutcome,
  FabricServerRole,
  OrgFabricServerRecord,
  OrgFabricSettings,
} from '@/lib/instance-api'

/** Where TurboFabric stands for an organization. */
export type FabricState = 'on' | 'paused' | 'off'

/** The role picker's value: `automatic` lets the control plane choose. */
export type FabricRoleChoice = 'automatic' | FabricServerRole

export function fabricState(
  settings: Pick<OrgFabricSettings, 'enabled' | 'paused'> | undefined
): FabricState {
  if (settings?.enabled === true) return 'on'
  if (settings?.paused === true) return 'paused'
  return 'off'
}

export function fabricStateLabel(state: FabricState): string {
  if (state === 'on') return 'On'
  if (state === 'paused') return 'Paused'
  return 'Off'
}

export function fabricServerRoleLabel(role: FabricServerRole): string {
  return role === 'gateway' ? 'Gateway' : 'Client'
}

export function fabricRoleChoice(
  server: Pick<OrgFabricServerRecord, 'role' | 'roleSource'>
): FabricRoleChoice {
  return server.roleSource === 'operator' ? server.role : 'automatic'
}

/** The PATCH `role` for a picker choice (null = automatic). */
export function fabricRolePatch(choice: FabricRoleChoice): FabricServerRole | null {
  return choice === 'automatic' ? null : choice
}

export function fabricRoleOptions(
  automaticRole: FabricServerRole
): { value: FabricRoleChoice; label: string }[] {
  return [
    {
      value: 'automatic',
      label: `Automatic (${fabricServerRoleLabel(automaticRole)})`,
    },
    { value: 'gateway', label: 'Gateway' },
    { value: 'client', label: 'Client' },
  ]
}

export function fabricMemberLabel(member: boolean): string {
  return member ? 'Has a TurboFabric address' : 'No TurboFabric address yet'
}

export const FABRIC_ROLE_HELP =
  'A gateway accepts connections from other servers; a client only connects out. Automatic picks gateway when the server has a public address. Roles are saved now and used for routing in a later release.'

export const FABRIC_PAUSED_NOTICE =
  'TurboFabric is turned off. Tunnels are down on every server, but keys and container networks are kept, so turning it back on is instant.'

/** A server's last reconcile, with the name to show for it. */
export type FabricServerOutcome = Readonly<{
  name: string
  reconcile: FabricReconcileOutcome | null
}>

/**
 * What the paused notice says, from what each server reported. Tunnels are
 * only called down once every server confirmed it.
 */
export type FabricPausedNotice =
  | Readonly<{ kind: 'down'; text: string }>
  | Readonly<{ kind: 'pending'; text: string }>
  | Readonly<{ kind: 'unconfirmed'; text: string }>
  | Readonly<{ kind: 'failed'; text: string; failures: readonly string[] }>

export const FABRIC_PAUSE_FAILED_NOTICE =
  'Some servers could not take their tunnel down, so it is still up on them:'

export const FABRIC_PAUSE_RETRY_HINT =
  'Fix the problem on those servers, then press Turn Off Again to retry.'

/** A pause, or a server switched off (removed), takes the tunnel down. */
function takesTunnelDown(reconcile: FabricReconcileOutcome | null): boolean {
  return reconcile?.action === 'pause' || reconcile?.action === 'remove'
}

function isPauseDone(outcome: FabricServerOutcome): boolean {
  return takesTunnelDown(outcome.reconcile) && outcome.reconcile?.state === 'done'
}

function pauseFailure(outcome: FabricServerOutcome): string | null {
  const reconcile = outcome.reconcile
  if (!reconcile || !takesTunnelDown(reconcile) || reconcile.state !== 'failed') return null
  return `${outcome.name}: ${reconcile.error ?? 'The server did not say why.'}`
}

export const FABRIC_PAUSE_UNCONFIRMED_NOTICE =
  'TurboFabric is turned off, but no server has confirmed that its tunnel is down yet. Turn it off again to ask every server.'

export function fabricPausedNotice(outcomes: readonly FabricServerOutcome[]): FabricPausedNotice {
  // Nothing confirmed (an older control plane, or a pause from before servers
  // reported back) is never read as down.
  if (outcomes.every((outcome) => outcome.reconcile === null)) {
    return { kind: 'unconfirmed', text: FABRIC_PAUSE_UNCONFIRMED_NOTICE }
  }
  const failures = outcomes.map(pauseFailure).filter((line): line is string => line !== null)
  if (failures.length > 0) {
    return { kind: 'failed', text: FABRIC_PAUSE_FAILED_NOTICE, failures }
  }
  const done = outcomes.filter(isPauseDone).length
  if (done === outcomes.length) return { kind: 'down', text: FABRIC_PAUSED_NOTICE }
  return {
    kind: 'pending',
    text: `Turning TurboFabric off: ${String(done)} of ${String(outcomes.length)} servers have taken their tunnel down.`,
  }
}

/**
 * Plain sentences about one server's last reconcile: its own error when it
 * failed, or what an apply that worked had to leave out.
 */
export function fabricReconcileLines(reconcile: FabricReconcileOutcome | null): {
  error: string | null
  warnings: readonly string[]
} {
  if (!reconcile) return { error: null, warnings: [] }
  if (reconcile.state === 'failed') {
    return { error: reconcile.error ?? 'The server did not say why.', warnings: [] }
  }
  if (reconcile.state === 'done') return { error: null, warnings: reconcile.warnings ?? [] }
  return { error: null, warnings: [] }
}

export type FabricConfirmCopy = Readonly<{
  title: string
  body: string
  confirmLabel: string
}>

export const FABRIC_PAUSE_CONFIRM: FabricConfirmCopy = {
  title: 'Turn Off TurboFabric',
  body: 'Tunnels go down on every server, so apps that talk across servers lose that connection until you turn it back on. Keys and container networks are kept, and turning it back on is instant.',
  confirmLabel: 'Turn Off TurboFabric',
}

export const FABRIC_REMOVE_CONFIRM: FabricConfirmCopy = {
  title: 'Remove TurboFabric Completely',
  body: 'This deletes every tunnel, every server key and every container network that spans servers, except networks whose servers all share a trusted LAN, which are kept. Running apps on the other networks lose that connection. Turning TurboFabric on again later starts from scratch.',
  confirmLabel: 'Remove TurboFabric Completely',
}

export function fabricServerOffConfirm(serverName: string): FabricConfirmCopy {
  return {
    title: 'Take This Server Off TurboFabric',
    body: `${serverName}'s tunnel goes down and the other servers stop reaching it over TurboFabric. Apps on other servers that talk to it that way lose the connection. Its address and settings are kept, so you can switch it back on at any time.`,
    confirmLabel: 'Switch Off',
  }
}
