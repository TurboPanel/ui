import { DeployHealthCheckMissingError, DeployResourceLimitExceededError } from '@/lib/instance-api'
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

/** What to show when `POST /environments/:id/deploy` is refused. */
export function deployErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : 'Failed to deploy environment'
  if (SERVER_SENTENCE_CODES.some((code) => message.includes(code))) {
    return (
      serverSentence(message) ??
      'This deploy uses host-level Compose features that this organization or your role does not allow.'
    )
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
      "A domain asks for a Let's Encrypt certificate, but this organization does not allow Let's Encrypt certificates. An organization owner or manager can turn on \"Allow Let's Encrypt certificates\" under Organization settings \u203a Domains & certificates, or pick a different certificate."
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
      "A hosting pinned to a Let's Encrypt certificate is bound to a local or datacenter-only address — ACME issuance needs a public bind scope."
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
  return null
}

/** Any refused deploy in plain words: the typed refusals first, then the coded ones. */
export function deployRefusalMessage(err: unknown): string {
  return deployPreviewFailureMessage(err) ?? deployErrorMessage(err)
}
