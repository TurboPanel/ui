import { LegacyProjectRedirect } from '@/components/org/project/project-route-screens'

/** Retired route: redirects to its new tab, keeping the query (`/environments/:environmentId/hosting`). */
export default function RetiredEnvironmentHostingRoute() {
  return <LegacyProjectRedirect segment="hosting" />
}
