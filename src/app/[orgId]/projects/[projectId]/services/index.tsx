import { LegacyProjectRedirect } from '@/components/org/project/project-route-screens'

/** Retired route: redirects to its new tab, keeping the query (`/projects/:projectId/services`). */
export default function RetiredServicesRoute() {
  return <LegacyProjectRedirect segment="services" />
}
