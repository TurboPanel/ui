import { useGlobalSearchParams, usePathname } from 'expo-router'
import type { OrganizationActivityFilter } from '@/lib/instance-api'

/** What `useLocalSearchParams` hands back. */
type RawSearchParams = Readonly<Record<string, string | string[] | undefined>>

/** What `router.setParams` takes: `undefined` removes a parameter. */
type UrlParams = Record<string, string | undefined>

/**
 * The Activity view lives in the URL (`?status=…&project=…&environment=…&offset=…`),
 * so back, reload and a shared link land on the same page and filters. Read it
 * with `readActivityParams`, write it back through `router.setParams` with
 * `activityParamsToUrl`; a default value is written as `undefined`, which drops
 * it from the address.
 */
export type ActivityView = Readonly<{
  filter: OrganizationActivityFilter
  projectId: string
  environmentId: string
  offset: number
}>

/** The outcome filter as the address spells it; `deploying` reads as "in progress" there. */
const FILTER_IN_URL: Record<OrganizationActivityFilter, string | undefined> = {
  all: undefined,
  succeeded: 'succeeded',
  failed: 'failed',
  deploying: 'in-progress',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function param(raw: RawSearchParams, key: string): string {
  const value = raw[key]
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

function filterFromUrl(value: string): OrganizationActivityFilter {
  const found = Object.entries(FILTER_IN_URL).find(([, inUrl]) => inUrl === value)
  return (found?.[0] as OrganizationActivityFilter | undefined) ?? 'all'
}

/** Only an id that could be one: anything else would be refused by the panel. */
function idFromUrl(value: string): string {
  return UUID_RE.test(value) ? value : ''
}

export function readActivityParams(raw: RawSearchParams): ActivityView {
  const projectId = idFromUrl(param(raw, 'project'))
  const offset = param(raw, 'offset')
  return {
    filter: filterFromUrl(param(raw, 'status')),
    projectId,
    // An environment is only offered inside a chosen project.
    environmentId: projectId ? idFromUrl(param(raw, 'environment')) : '',
    offset: /^\d{1,9}$/.test(offset) ? Number.parseInt(offset, 10) : 0,
  }
}

export function activityParamsToUrl(view: ActivityView): UrlParams {
  return {
    status: FILTER_IN_URL[view.filter],
    project: view.projectId || undefined,
    environment: (view.projectId && view.environmentId) || undefined,
    offset: view.offset > 0 ? String(view.offset) : undefined,
  }
}

/** Whether `pathname` is this organization's Activity screen (query and trailing slash ignored). */
export function isActivityPath(pathname: string, orgId: string): boolean {
  const path = (pathname.split('?')[0] ?? '').replace(/\/+$/, '')
  return orgId.length > 0 && path === `/${orgId}/activity`
}

/**
 * The Activity view and whether Activity is the screen on show. Reads the
 * global params, not the local ones: on a phone the section is drawn by the
 * org tab pager in the `[orgId]` layout, whose local params never see the
 * `activity` route's query, while `router.setParams` writes to that focused
 * route. Off the Activity path (another pager tab) the view is the default
 * and `visible` is false, so the screen can stop polling.
 */
export function useActivityView(orgId: string): Readonly<{ view: ActivityView; visible: boolean }> {
  const pathname = usePathname()
  const params = useGlobalSearchParams()
  const visible = isActivityPath(pathname, orgId)
  return { view: readActivityParams(visible ? params : {}), visible }
}
