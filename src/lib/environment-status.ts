import { deploymentGroupTone, type DeploymentGroup } from '@/lib/deployment-history'

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
export function siteUrlFromHostname(hostname: string | null | undefined): string | null {
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

type SiteHostingRow = Readonly<{
  createdAt?: string | null
  options?: Readonly<Record<string, unknown>> | null
}>

/** A hosting row that answers on the public address (the default bind). */
function isPublicHosting(row: SiteHostingRow): boolean {
  const bind = row.options?.bind
  return bind === undefined || bind === null || bind === 'public'
}

/** The hostnames one hosting row answers on (`options.hostnames`), trimmed, blanks left out. */
export function hostingHostnames(row: SiteHostingRow): string[] {
  const raw = row.options?.hostnames
  if (!Array.isArray(raw)) return []
  return raw
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
}

/** Hosting rows oldest first (by `createdAt`); rows without a usable time keep their order, last. */
export function oldestHostingsFirst<T extends SiteHostingRow>(rows: readonly T[]): T[] {
  return rows
    .map((row, index) => ({ row, index, at: Date.parse(row.createdAt ?? '') }))
    .sort((a, b) => {
      const byTime = (Number.isNaN(a.at) ? Infinity : a.at) - (Number.isNaN(b.at) ? Infinity : b.at)
      return byTime === 0 || Number.isNaN(byTime) ? a.index - b.index : byTime
    })
    .map(({ row }) => row)
}

/**
 * Every public hostname an environment can be visited at: the
 * `options.hostnames` of its hosting rows, oldest row first, each name once.
 * Wildcards and anything that is not a usable host are left out.
 */
export function environmentSiteHostnames(
  rowsByService: Readonly<Record<string, readonly SiteHostingRow[]>>,
  serviceIds: readonly string[]
): string[] {
  const rows = oldestHostingsFirst(
    serviceIds.flatMap((serviceId) => rowsByService[serviceId] ?? []).filter(isPublicHosting)
  )
  const seen = new Set<string>()
  const names: string[] = []
  for (const row of rows) {
    for (const name of hostingHostnames(row)) {
      const key = name.toLowerCase()
      if (!siteUrlFromHostname(name) || seen.has(key)) continue
      seen.add(key)
      names.push(name)
    }
  }
  return names
}

/** `environment.options.primaryHostname` when it is a non-empty string. */
export function readPrimaryHostnameOption(options: unknown): string | null {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return null
  const value = (options as Record<string, unknown>).primaryHostname
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/**
 * The hostname Visit opens: the one picked as primary while it is still one of
 * the environment's hostnames, else the oldest. Null when there is none.
 */
export function primarySiteHostname(
  hostnames: readonly string[],
  stored: string | null
): string | null {
  if (stored) {
    const match = hostnames.find((name) => name.toLowerCase() === stored.toLowerCase())
    if (match) return match
  }
  return hostnames[0] ?? null
}

/** "2h ago" from an ISO stamp; null when there is none to read. */
export function formatAgo(value: string | null | undefined, now: number): string | null {
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
  progressLabel: string | null | undefined
): EnvironmentStatusFact {
  if (!lastDeploy) {
    return { key: 'lastDeploy', caption: 'Last deploy', value: 'Never', tone: 'idle' }
  }
  // Same started rule as the Deployments tab: a deploy a server has started reads Running.
  const verdict = deploymentGroupTone(lastDeploy)
  if (progressLabel && verdict.tone === 'pending') {
    return { key: 'lastDeploy', caption: 'Deploying', value: progressLabel, tone: 'busy' }
  }
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
    /** "Step 3 of 7 · Installing Docker" from the command status poll while the deploy runs. */
    progressLabel?: string | null
    changesNotDeployed?: number | null
    now: number
  }>
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
    facts.push(lastDeployFact(input.lastDeploy, input.now, input.progressLabel))
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
