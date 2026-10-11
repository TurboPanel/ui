import { LegacyProjectRedirect } from '@/components/org/project/project-route-screens'

/** Retired route: redirects to its new tab, keeping the query (`/projects/:projectId/hosting`). */
export default function RetiredHostingRoute() {
  return <LegacyProjectRedirect segment="hosting" />
}
