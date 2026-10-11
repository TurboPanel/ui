import {
  deploymentStatusTone,
  type DeploymentGroup,
} from '@/lib/deployment-history'

/** The words behind one status chip. Tone pairs with the label; never colour alone. */
export type StatusFactTone = 'ok' | 'busy' | 'bad' | 'idle'

export type EnvironmentStatusFact = Readonly<{
  key: 'running' | 'lastDeploy' | 'changes'
  /** Small caption: "Running now", "Last deploy", "Not deployed". */
  caption: string
  /** The word or phrase: "Running", "Failed · 2h ago", "3 changes". */
  value: string
  tone: StatusFactTone
}>

/** `https://` form of a hosting hostname, or null when it is not a usable host. */
export function siteUrlFromHostname(
  hostname: string | null | undefined,
): string | null {
  const trimmed = hostname?.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      return new URL(trimmed).toString()
    } catch {
      return null
    }
  }
  if (!/^[a-z0-9*]([a-z0-9.-]*[a-z0-9])?$/i.test(trimmed)) return null
  // A wildcard row has no single address to visit.
  if (trimmed.includes('*')) return null
  return `https://${trimmed}`
}

/** The first hostname any of these hosting rows names, in service order. */
export function firstSiteHostname(
  rowsByService: Readonly<
    Record<string, readonly Readonly<{ name: string | null }>[]>
  >,
  serviceIds: readonly string[],
): string | null {
  for (const serviceId of serviceIds) {
    for (const row of rowsByService[serviceId] ?? []) {
      if (siteUrlFromHostname(row.name)) return row.name?.trim() ?? null
    }
  }
  return null
}

/** "2h ago" from an ISO stamp; null when there is none to read. */
export function formatAgo(
  value: string | null | undefined,
  now: number,
): string | null {
  if (!value) return null
  const at = Date.parse(value)
  if (Number.isNaN(at)) return null
  const seconds = Math.max(0, Math.floor((now - at) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const RUNNING_TONES: Readonly<Record<string, StatusFactTone>> = {
  Running: 'ok',
  'Starting…': 'busy',
  Stopped: 'bad',
}

/** What the last deploy did, and when. */
function lastDeployFact(
  lastDeploy: DeploymentGroup | null,
  now: number,
): EnvironmentStatusFact {
  if (!lastDeploy) {
    return { key: 'lastDeploy', caption: 'Last deploy', value: 'Never', tone: 'idle' }
  }
  const verdict = deploymentStatusTone(lastDeploy.status, lastDeploy.strategyOutcome)
  const ago = formatAgo(lastDeploy.startedAt, now)
  let tone: StatusFactTone = 'busy'
  if (verdict.tone === 'success') tone = 'ok'
  else if (verdict.tone === 'failed') tone = 'bad'
  return {
    key: 'lastDeploy',
    caption: 'Last deploy',
    value: ago ? `${verdict.label} · ${ago}` : verdict.label,
    tone,
  }
}

/**
 * The status triplet an environment header shows: what is running now, how the
 * last deploy ended, and how many changes are saved but not deployed.
 *
 * The third fact is shown only when the caller has a real count. The API does
 * not serve one for an environment yet, so until it does the header carries the
 * first two and never guesses.
 */
export function environmentStatusFacts(
  input: Readonly<{
    /** From `environmentStatusTone`: Running, Starting…, Stopped, Not started yet, Unknown. */
    runningLabel: string
    /** Newest deploy, or null when there is none; `undefined` while history loads. */
    lastDeploy: DeploymentGroup | null | undefined
    changesNotDeployed?: number | null
    now: number
  }>,
): EnvironmentStatusFact[] {
  const facts: EnvironmentStatusFact[] = [
    {
      key: 'running',
      caption: 'Running now',
      value: input.runningLabel,
      tone: RUNNING_TONES[input.runningLabel] ?? 'idle',
    },
  ]
  if (input.lastDeploy !== undefined) {
    facts.push(lastDeployFact(input.lastDeploy, input.now))
  }
  const changes = input.changesNotDeployed
  if (changes != null && changes > 0) {
    facts.push({
      key: 'changes',
      caption: 'Not deployed',
      value: changes === 1 ? '1 change' : `${changes} changes`,
      tone: 'busy',
    })
  }
  return facts
}
