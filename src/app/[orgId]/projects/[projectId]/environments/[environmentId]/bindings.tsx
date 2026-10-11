import { LegacyProjectRedirect } from '@/components/org/project/project-route-screens'

/** Retired route: redirects to its new tab, keeping the query (`/environments/:environmentId/bindings`). */
export default function RetiredEnvironmentBindingsRoute() {
  return <LegacyProjectRedirect segment="bindings" />
}
