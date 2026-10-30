import type { FabricServerRole, OrgFabricServerRecord, OrgFabricSettings } from '@/lib/instance-api'

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
  body: 'This deletes every tunnel, every server key and every container network that spans servers. Running apps that span servers lose that network. Turning TurboFabric on again later starts from scratch.',
  confirmLabel: 'Remove TurboFabric Completely',
}

export function fabricServerOffConfirm(serverName: string): FabricConfirmCopy {
  return {
    title: 'Take This Server Off TurboFabric',
    body: `${serverName}'s tunnel goes down and the other servers stop reaching it over TurboFabric. Apps on other servers that talk to it that way lose the connection. Its address and settings are kept, so you can switch it back on at any time.`,
    confirmLabel: 'Switch Off',
  }
}
