import type { UpgradeRunServerSort, UpgradeServerOutcome } from '@/lib/instance-api'
import {
  RUN_STATUS_FILTERS,
  RUN_TRIGGER_FILTERS,
  SERVER_OUTCOME_FILTERS,
  type RunStatusFilter,
  type RunTriggerFilter,
} from '@/lib/upgrade-history-display'

/**
 * The view of the update history screens lives in the URL, so back, reload
 * and a shared link land on the same page, filter and sort. Each screen reads
 * its state with `read…Params` and writes it back with `…ParamsToUrl` through
 * `router.setParams`; a default value is written as `undefined`, which drops
 * it from the address.
 */

/** What `useLocalSearchParams` hands back. */
export type RawSearchParams = Readonly<Record<string, string | string[] | undefined>>

/** What `router.setParams` takes: `undefined` removes a parameter. */
export type UrlParams = Record<string, string | undefined>

function first(raw: RawSearchParams, key: string): string {
  const value = raw[key]
  const one = Array.isArray(value) ? value[0] : value
  return one?.trim() ?? ''
}

function oneOf<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

/** A page offset from the address: a whole number of rows, never negative. */
function offsetOf(value: string): number {
  if (!/^\d{1,9}$/.test(value)) return 0
  return Number.parseInt(value, 10)
}

function offsetToUrl(offset: number): string | undefined {
  return offset > 0 ? String(offset) : undefined
}

export type HistoryView = Readonly<{
  status: RunStatusFilter
  trigger: RunTriggerFilter
  offset: number
}>

const HISTORY_STATUSES = RUN_STATUS_FILTERS.map((entry) => entry.value)
const HISTORY_TRIGGERS = RUN_TRIGGER_FILTERS.map((entry) => entry.value)

export function readHistoryParams(raw: RawSearchParams): HistoryView {
  return {
    status: oneOf(first(raw, 'status'), HISTORY_STATUSES, 'any'),
    trigger: oneOf(first(raw, 'trigger'), HISTORY_TRIGGERS, ''),
    offset: offsetOf(first(raw, 'offset')),
  }
}

export function historyParamsToUrl(view: HistoryView): UrlParams {
  return {
    status: view.status === 'any' ? undefined : view.status,
    trigger: view.trigger || undefined,
    offset: offsetToUrl(view.offset),
  }
}

export type SortDir = 'asc' | 'desc'

export type RunServerView = Readonly<{
  status: '' | UpgradeServerOutcome
  organizationId: string | null
  q: string
  sort: UpgradeRunServerSort
  dir: SortDir
  offset: number
}>

const RUN_SORTS: readonly UpgradeRunServerSort[] = [
  'status',
  'organization',
  'server',
  'started',
  'finished',
  'duration',
  'attempts',
]

export function readRunServerParams(raw: RawSearchParams): RunServerView {
  return {
    status: oneOf(first(raw, 'status'), SERVER_OUTCOME_FILTERS, ''),
    organizationId: first(raw, 'org') || null,
    q: first(raw, 'q'),
    sort: oneOf(first(raw, 'sort'), RUN_SORTS, 'status'),
    dir: oneOf(first(raw, 'dir'), ['asc', 'desc'] as const, 'asc'),
    offset: offsetOf(first(raw, 'offset')),
  }
}

export function runServerParamsToUrl(view: RunServerView): UrlParams {
  return {
    status: view.status || undefined,
    org: view.organizationId ?? undefined,
    q: view.q.trim() || undefined,
    sort: view.sort === 'status' ? undefined : view.sort,
    dir: view.dir === 'asc' ? undefined : view.dir,
    offset: offsetToUrl(view.offset),
  }
}

/** `path` plus the set parameters as a query string (`path` alone when none is set). */
export function withQuery(path: string, params: UrlParams): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, value)
  }
  return query.size > 0 ? `${path}?${query.toString()}` : path
}
