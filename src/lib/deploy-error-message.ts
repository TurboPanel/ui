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
    return "A hosting is pinned to a Let's Encrypt certificate, but this organization has not enabled Let's Encrypt. Turn on \"Allow Let's Encrypt certificates\" in TLS settings, or pin a different certificate."
  }
  if (message.includes('acme_requires_public_bind')) {
    return "A hosting pinned to a Let's Encrypt certificate is bound to a local or datacenter-only address — ACME issuance needs a public bind scope."
  }
  return message
}
