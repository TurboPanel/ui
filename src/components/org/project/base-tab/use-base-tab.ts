import { useMemo } from 'react'
import { useProjectContext } from '@/components/org/project/project-context'
import type {
  ConfigViewSide,
  EnvironmentConfigViewResponse,
  ProjectPrincipalRecord,
} from '@/lib/instance-api'
import { useEnvironmentConfigViews } from '@/lib/queries/environment-cards'
import { useProjectPrincipals } from '@/lib/queries/projects'
import { environmentDisplayName } from '@/lib/resource-labels'
import {
  baseEnvironmentRows,
  baseViewOf,
  type BaseEnvironment,
  type BaseEnvironmentRow,
} from '@/lib/v4/project-base'

export type BaseTabModel =
  | Readonly<{ state: 'loading' }>
  | Readonly<{ state: 'empty' }>
  | Readonly<{ state: 'unavailable' }>
  | Readonly<{
      state: 'ready'
      base: ConfigViewSide
      /** Any environment's view: it carries the Base. */
      view: EnvironmentConfigViewResponse
      environments: readonly BaseEnvironment[]
      rows: readonly BaseEnvironmentRow[]
      /** `undefined` when the project's Linux users could not be read. */
      principals: readonly ProjectPrincipalRecord[] | undefined
    }>

/**
 * The calls behind the Base tab: every environment's config view (each one
 * carries the Base) and the project's Linux users. `unavailable` means no
 * environment's configuration could be read (no manage access, or a saved
 * compose that does not parse): the screen then keeps the page that was here
 * before, rather than drawing a Base with nothing in it.
 */
export function useBaseTabModel(): BaseTabModel {
  const { orgId, projectId, environments, loading } = useProjectContext()
  const environmentIds = useMemo(() => environments.map((environment) => environment.id), [environments])
  const { views, isLoading } = useEnvironmentConfigViews(orgId, environmentIds)
  const principals = useProjectPrincipals(orgId, projectId)
  const list = useMemo<BaseEnvironment[]>(
    () =>
      environments.map((environment) => ({
        id: environment.id,
        name: environmentDisplayName(environment),
        view: views[environment.id],
      })),
    [environments, views],
  )
  const rows = useMemo(() => baseEnvironmentRows(list), [list])
  const view = baseViewOf(list)

  if (loading && environments.length === 0) return { state: 'loading' }
  if (environments.length === 0) return { state: 'empty' }
  if (isLoading || principals.isLoading) return { state: 'loading' }
  if (view === null) return { state: 'unavailable' }
  return {
    state: 'ready',
    base: view.base,
    view,
    environments: list,
    rows,
    principals: principals.data?.principals,
  }
}
