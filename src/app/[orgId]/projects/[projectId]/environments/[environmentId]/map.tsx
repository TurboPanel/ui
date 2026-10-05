import { LegacyProjectRedirect } from '@/components/org/project/project-route-screens'

/** Retired route: redirects to its new tab, keeping the query (`/environments/:environmentId/map`). */
export default function RetiredEnvironmentMapRoute() {
  return <LegacyProjectRedirect segment="map" />
}
