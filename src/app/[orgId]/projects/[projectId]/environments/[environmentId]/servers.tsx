import { LegacyProjectRedirect } from '@/components/org/project/project-route-screens'

/** Retired route: redirects to its new tab, keeping the query (`/environments/:environmentId/servers`). */
export default function RetiredEnvironmentServersRoute() {
  return <LegacyProjectRedirect segment="servers" />
}
