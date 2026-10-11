import { LegacyProjectRedirect } from '@/components/org/project/project-route-screens'

/** Retired route: redirects to its new tab, keeping the query (`/environments/:environmentId/compose`). */
export default function RetiredEnvironmentComposeRoute() {
  return <LegacyProjectRedirect segment="compose" />
}
