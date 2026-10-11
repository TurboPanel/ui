import { LegacyProjectRedirect } from '@/components/org/project/project-route-screens'

/** Retired route: redirects to its new tab, keeping the query (`/environments/:environmentId/services`). */
export default function RetiredEnvironmentServicesRoute() {
  return <LegacyProjectRedirect segment="services" />
}
