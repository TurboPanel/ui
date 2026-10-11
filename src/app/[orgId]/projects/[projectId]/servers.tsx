import { LegacyProjectRedirect } from '@/components/org/project/project-route-screens'

/** Retired route: redirects to its new tab, keeping the query (`/projects/:projectId/servers`). */
export default function RetiredServersRoute() {
  return <LegacyProjectRedirect segment="servers" />
}
