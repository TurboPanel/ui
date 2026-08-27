/**
 * Where a Git provider should send webhooks for this instance — and whether it
 * can actually get there.
 *
 * TurboPanel runs happily on a LAN (`https://panel.lan:8443`, a private IP, a
 * `.internal` name): cloning and token minting are outbound, so they work.
 * Webhooks are the one inbound hop, and the failure is silent — deliveries pile
 * up in the provider's log and nothing deploys. So the panel says so up front
 * rather than leaving the operator to discover it.
 *
 * This is a *hint* computed from the configured public URLs, not a probe:
 * nothing here dials anything, and a public-looking URL can still be
 * firewalled. Mirrors `lib/git/webhook-reachability.ts` on the control plane —
 * a different repo and runtime, so the rule is reproduced rather than imported.
 */

import { isLoopbackOrPrivateHostname } from '@/lib/install-tls'
import { GITHUB_WEBHOOK_PATH, GITLAB_WEBHOOK_PATH } from '@/lib/instance-api'

export type GitWebhookProvider = 'github' | 'gitlab'

export type GitWebhookHint = {
  /** Full URL to paste into the provider's webhook settings, or `null` when unknown. */
  webhookUrl: string | null
  /** False when every configured origin looks LAN-only, or none is configured. */
  reachable: boolean
  /** Operator-facing explanation when `reachable` is false; `null` otherwise. */
  note: string | null
}

/**
 * Both notes stop short of recommending the `ref` field on
 * `POST /environments/:id/deploy`: the control plane still answers
 * `501 source_ref_unsupported` to any request that sets it
 * (`PREPARE_HONORS_SOURCE_SELECTION` is `false`). Until that flips, the only
 * working fallback is a manual deploy, which builds each service’s declared
 * branch.
 */
export const LAN_WEBHOOK_NOTE =
  'This instance’s public URL is on a private network, so the Git provider ' +
  'cannot deliver webhooks to it. Auto-deploy will not fire — publish a ' +
  'reachable https URL under Networking, or deploy the environment manually, ' +
  'which builds each service’s declared branch. Picking a specific commit ' +
  'with the `ref` field on POST /environments/:id/deploy is not supported yet ' +
  '(the route answers 501 source_ref_unsupported).'

export const NO_URL_WEBHOOK_NOTE =
  'No public URL is configured for this instance, so the webhook endpoint has ' +
  'no address to give the Git provider. Set one under Networking, or deploy ' +
  'the environment manually, which builds each service’s declared branch. ' +
  'Picking a specific commit with the `ref` field on POST ' +
  '/environments/:id/deploy is not supported yet (the route answers 501 ' +
  'source_ref_unsupported).'

/** Each provider has its own ingress path; the reachability rule is shared. */
const WEBHOOK_PATH_BY_PROVIDER: Record<GitWebhookProvider, string> = {
  github: GITHUB_WEBHOOK_PATH,
  gitlab: GITLAB_WEBHOOK_PATH,
}

/** An https origin on a publicly routable host is assumed deliverable. */
function isPubliclyReachableOrigin(origin: string): boolean {
  const trimmed = origin.trim()
  if (!trimmed.startsWith('https://')) return false
  try {
    const url = new URL(trimmed)
    return !isLoopbackOrPrivateHostname(url.hostname)
  } catch {
    return false
  }
}

/** Drop every trailing `/` without a regex — `/\/+$/` is super-linear. */
function stripTrailingSlashes(value: string): string {
  let end = value.length
  while (end > 0 && value.codePointAt(end - 1) === 0x2f) {
    end -= 1
  }
  return end === value.length ? value : value.slice(0, end)
}

function webhookUrlFor(origin: string, path: string): string {
  return `${stripTrailingSlashes(origin)}${path}`
}

/** The origins whose deliveries resolve without a ref in the path. */
const HOSTED_PROVIDER_ORIGINS: Record<GitWebhookProvider, string> = {
  github: 'https://github.com',
  gitlab: 'https://gitlab.com',
}

/**
 * The ingress path for one app.
 *
 * Hosted providers get the clean path: github.com stamps the App id on every
 * delivery and gitlab.com echoes a token the control plane can digest, so the
 * app is identifiable from the request alone and nothing internal needs to
 * appear in the URL. A **self-hosted** origin gets the app's `webhookRef`
 * appended, because GitHub Enterprise Server and self-managed GitLab ship on
 * their own cadence and the header is not a safe single point of failure there.
 *
 * Mirrors `webhookPathFor` in the control plane's
 * `lib/git/webhook-reachability.ts` — a different repo and runtime, so the rule
 * is reproduced rather than imported. Keep the two in step.
 */
export function webhookPathFor(
  provider: GitWebhookProvider,
  webhookRef?: string | null,
  baseUrl?: string | null,
): string {
  const base = WEBHOOK_PATH_BY_PROVIDER[provider]
  if (!webhookRef || !baseUrl) return base
  const normalized = stripTrailingSlashes(baseUrl.trim())
  if (normalized === HOSTED_PROVIDER_ORIGINS[provider]) return base
  return `${base}/${encodeURIComponent(webhookRef)}`
}

/**
 * Classify the instance's configured origins for one provider.
 *
 * The first publicly reachable origin wins — that is the one worth handing to
 * the provider. When none qualifies, the first configured origin is still
 * returned so the operator can see the endpoint's shape, paired with the note
 * explaining why it will not work as-is.
 *
 * Pass a `webhookRef` to get one app's own URL. Most callers do not need to:
 * the control plane already resolves it onto the app and source reads, and
 * this hint is consulted mainly for the reachability note.
 */
export function gitWebhookHint(
  origins: readonly string[],
  provider: GitWebhookProvider,
  webhookRef?: string | null,
  baseUrl?: string | null,
): GitWebhookHint {
  const path = webhookPathFor(provider, webhookRef, baseUrl)
  const usable = origins
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)

  if (usable.length === 0) {
    return { webhookUrl: null, reachable: false, note: NO_URL_WEBHOOK_NOTE }
  }

  const publicOrigin = usable.find(isPubliclyReachableOrigin)
  if (publicOrigin) {
    return {
      webhookUrl: webhookUrlFor(publicOrigin, path),
      reachable: true,
      note: null,
    }
  }

  return {
    webhookUrl: webhookUrlFor(usable[0]!, path),
    reachable: false,
    note: LAN_WEBHOOK_NOTE,
  }
}
