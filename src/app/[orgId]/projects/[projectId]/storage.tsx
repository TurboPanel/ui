import { LegacyProjectRedirect } from '@/components/org/project/project-route-screens'

/** Retired route: redirects to its new tab, keeping the query (`/projects/:projectId/storage`). */
export default function RetiredStorageRoute() {
  return <LegacyProjectRedirect segment="storage" />
}
