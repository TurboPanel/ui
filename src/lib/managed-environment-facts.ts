import type { StatusFactTone } from '@/lib/environment-status'
import { managedReleaseSummary } from '@/lib/managed-releases'
import {
  managedCatalogEntryForCode,
  type ManagedDetailResponse,
  type ManagedStatus,
} from '@/lib/managed-services'

/** One item of the status line under a managed database's environment name. */
export type ManagedHeaderFact = Readonly<{
  key: 'running' | 'engine' | 'server' | 'externalAccess'
  caption: string
  value: string
  tone: StatusFactTone
}>

const STATUS_WORDS: Readonly<Record<ManagedStatus, { value: string; tone: StatusFactTone }>> = {
  provisioning: { value: 'Creating…', tone: 'busy' },
  applying: { value: 'Applying changes…', tone: 'busy' },
  ready: { value: 'Running', tone: 'ok' },
  stopped: { value: 'Stopped', tone: 'idle' },
  failed: { value: 'Failed', tone: 'bad' },
}

/** What the database is doing, in the header's words. */
export function managedRunningFact(status: ManagedStatus | null | undefined): ManagedHeaderFact {
  const word = status ? STATUS_WORDS[status] : { value: 'Not created yet', tone: 'idle' as const }
  return { key: 'running', caption: 'Database', ...word }
}

/**
 * The status line of a managed database: what it is doing, the engine and its
 * base image ("PostgreSQL 18 · Alpine"), the server, and whether external
 * access is on. Facts the API has not given are left out, never guessed.
 */
export function managedEnvironmentFacts(
  detail: ManagedDetailResponse | null,
  status: ManagedStatus | null | undefined
): ManagedHeaderFact[] {
  const facts: ManagedHeaderFact[] = [managedRunningFact(status)]
  const managed = detail?.managed
  if (!managed) return facts
  const engineLabel = managed.engine ? managedCatalogEntryForCode(managed.engine)?.label : null
  const engine = managedReleaseSummary(engineLabel, detail.release) ?? engineLabel
  if (engine) facts.push({ key: 'engine', caption: 'Engine', value: engine, tone: 'idle' })
  const server = detail.server?.name?.trim() || detail.server?.hostname?.trim()
  if (server) facts.push({ key: 'server', caption: 'Server', value: server, tone: 'idle' })
  const servers = detail.externalAccess?.servers
  if (servers && servers.length > 0) {
    const on = servers.some((row) => row.enabled)
    facts.push({
      key: 'externalAccess',
      caption: 'External access',
      value: on ? 'On' : 'Off',
      tone: on ? 'ok' : 'idle',
    })
  }
  return facts
}
