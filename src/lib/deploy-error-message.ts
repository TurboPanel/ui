import {
  DeployHealthCheckMissingError,
  DeployNetworkSharesRefusedError,
  DeployResourceLimitExceededError,
  DeployTunnelRefusedError,
} from '@/lib/instance-api'
import { tunnelDeployRefusalMessage } from '@/lib/tunnels'
import { TURBOFABRIC_PRODUCT_NAME } from '@/lib/platform-copy'

/**
 * Deploy refusals whose server-written sentence is the whole answer: it names
 * the offending keys or paths and who can fix it. `apiFetch` appends that
 * sentence after ` — `; show it alone rather than behind the raw status line.
 */
const SERVER_SENTENCE_CODES = [
  'compose_host_access_requires_manager',
  'compose_host_access_requires_approval',
  'compose_field_requires_org_opt_in',
] as const

function serverSentence(message: string): string | null {
  const at = message.indexOf(' — ')
  if (at === -1) return null
  const sentence = message.slice(at + ' — '.length).trim()
  return sentence.length > 0 ? sentence : null
}

function quotedList(names: readonly string[]): string {
  return names.map((name) => `"${name}"`).join(', ')
}

/**
 * Plain words for a refused network share: what was refused, why, and who or
 * what fixes it. The server setting names the servers; the others say who can
 * grant the permission or approve the shares.
 */
export function networkSharesRefusalMessage(err: DeployNetworkSharesRefusedError): string {
  const volumes = err.volumes.length > 0 ? ` (${quotedList(err.volumes)})` : ''
  const head = `This compose file mounts a network share${volumes}.`
  if (err.reason === 'server_setting') {
    const where =
      err.servers.length > 0 ? quotedList(err.servers.map((server) => server.name)) : 'the server'
    return `${head} Network shares are not allowed on ${where}. Turn on "Allow Network Shares" in the server's settings, then deploy again.`
  }
  if (err.reason === 'approval') {
    const turnedBack =
      err.servers.length > 0
        ? ` Allow Network Shares was turned off and on again on ${quotedList(err.servers.map((server) => server.name))} since the last approval, which voids it.`
        : ''
    return `${head} This was an automated deploy (a git push or a schedule), and a manual deploy must approve these shares first.${turnedBack} Deploy once from the web interface as an organization owner or manager, or as someone with the Deploy network shares permission; automated deploys of the same shares then run.`
  }
  return `${head} You do not have the Deploy network shares permission. An organization owner or manager can deploy it, and an owner can grant you the permission under Access.`
}

/** The servers a share refusal names (the ones with Allow Network Shares off, or turned off and on again); empty for any other error. */
export function networkSharesRefusalServers(err: unknown): { id: string; name: string }[] {
  return err instanceof DeployNetworkSharesRefusedError ? err.servers : []
}

/** A refusal the person must see at once: the deploy preview closes so it is not hidden under it. */
export function deployRefusalClosesPreview(err: unknown): boolean {
  return err instanceof DeployNetworkSharesRefusedError
}

/** The deploy was refused because an app has no Hosting Account to run as. */
export function isHostingAccountRefusal(err: unknown): boolean {
  return err instanceof Error && err.message.includes('principal_required_for_service_kind')
}

/** What to show when `POST /environments/:id/deploy` is refused. */
export function deployErrorMessage(err: unknown): string {
  if (err instanceof DeployTunnelRefusedError) {
    return tunnelDeployRefusalMessage(err.code, err.hostnames) ?? err.message
  }
  if (err instanceof DeployNetworkSharesRefusedError) {
    return networkSharesRefusalMessage(err)
  }
  const message = err instanceof Error ? err.message : 'Failed to deploy environment'
  if (message.includes('compose_network_shares_refused')) {
    return (
      serverSentence(message) ??
      'This compose file mounts a network share that this server or your role does not allow. Turn on "Allow Network Shares" in the server\'s settings, and ask an organization owner or manager to deploy it.'
    )
  }
  if (SERVER_SENTENCE_CODES.some((code) => message.includes(code))) {
    return (
      serverSentence(message) ??
      'This deploy uses host-level Compose features that this organization or your role does not allow.'
    )
  }
  if (message.includes('tunnel_name_public_certificate')) {
    return tunnelDeployRefusalMessage('tunnel_name_public_certificate') ?? message
  }
  if (message.includes('principal_required_for_service_kind')) {
    return 'Add a Hosting Account under Bindings first.'
  }
  if (message.includes('server_placement_mismatch')) {
    return "Deploy target does not match the project's pinned server placement."
  }
  if (message.includes('fabric_reconcile_failed')) {
    return `${TURBOFABRIC_PRODUCT_NAME} could not be configured on one of the servers…`
  }
  if (message.includes('fabric_reconcile_pending')) {
    return `${TURBOFABRIC_PRODUCT_NAME} is still converging on the target servers — try the deploy again in a moment.`
  }
  if (message.includes('acme_requires_org_opt_in')) {
    return (
      serverSentence(message) ??
      "A domain asks for a Let's Encrypt certificate, but this organization does not allow Let's Encrypt certificates. An organization owner or manager can turn on \"Allow Let's Encrypt certificates\" under Organization Settings \u203a Domains & Certificates, or pick a different certificate."
    )
  }
  if (message.includes('letsencrypt_hostname_unsupported')) {
    return (
      serverSentence(message) ??
      "Let's Encrypt cannot issue a certificate for one of these names (a wildcard, an IP address or a private name). Pick a different certificate."
    )
  }
  if (message.includes('tls_pin_mismatch')) {
    return (
      serverSentence(message) ??
      'A pinned certificate does not cover every name of a hosting. Upload one that lists them all, or pin another.'
    )
  }
  if (message.includes('acme_requires_public_bind')) {
    return (
      serverSentence(message) ??
      "A hosting pinned to a Let's Encrypt certificate is bound to a local or datacenter-network-only address — ACME issuance needs a public bind scope."
    )
  }
  return message
}

/**
 * The deploy refusals that come back as typed errors (a missing health check,
 * a resource limit), in plain words with the next step; `null` for any other.
 */
export function deployPreviewFailureMessage(err: unknown): string | null {
  if (err instanceof DeployHealthCheckMissingError) {
    if (err.required) {
      return 'A service requires a compose healthcheck before the first start. Add healthcheck: in Compose, or set Health check policy to Disabled in service settings.'
    }
    return 'Health-check warnings are enabled for a service. Confirm the deploy from this environment, or set Health check policy to Disabled.'
  }
  if (err instanceof DeployResourceLimitExceededError) {
    return 'This start would exceed a resource limit. Review the capacity of this environment and try again.'
  }
  if (err instanceof DeployTunnelRefusedError) {
    return tunnelDeployRefusalMessage(err.code, err.hostnames)
  }
  if (err instanceof DeployNetworkSharesRefusedError) {
    return networkSharesRefusalMessage(err)
  }
  return null
}

/** Any refused deploy in plain words: the typed refusals first, then the coded ones. */
export function deployRefusalMessage(err: unknown): string {
  return deployPreviewFailureMessage(err) ?? deployErrorMessage(err)
}
