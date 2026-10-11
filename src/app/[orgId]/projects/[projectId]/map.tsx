import { LegacyProjectRedirect } from '@/components/org/project/project-route-screens'

/** Retired route: redirects to its new tab, keeping the query (`/projects/:projectId/map`). */
export default function RetiredMapRoute() {
  return <LegacyProjectRedirect segment="map" />
}
