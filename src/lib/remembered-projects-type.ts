import { useGlobalSearchParams, usePathname } from 'expo-router'
import { useEffect, useState } from 'react'
import { parseProjectTypeFilter, type ProjectTypeFilter } from '@/lib/v4/projects-home'

/**
 * The Projects type filter to show and to link back to. On the Projects list
 * it is the URL's `?type=`; anywhere else (Activity, Servers) it is the one
 * the list was last left on, so a tab or a swipe back to Projects keeps it.
 */
export function rememberedProjectsType(
  previous: ProjectTypeFilter,
  pathname: string,
  orgId: string,
  type: string | readonly string[] | undefined
): ProjectTypeFilter {
  const path = pathname.split('?')[0]
  return path === `/${orgId}/projects` ? parseProjectTypeFilter(type) : previous
}

/** {@link rememberedProjectsType} for the bottom tabs and the native pager. */
export function useRememberedProjectsType(orgId: string): ProjectTypeFilter {
  const pathname = usePathname()
  const { type } = useGlobalSearchParams<{ type?: string | string[] }>()
  const [remembered, setRemembered] = useState<ProjectTypeFilter>('all')
  const current = rememberedProjectsType(remembered, pathname, orgId, type)
  useEffect(() => {
    setRemembered(current)
  }, [current])
  return current
}
