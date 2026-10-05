import { LegacyProjectRedirect } from '@/components/org/project/project-route-screens'

/** Retired route: redirects to its new tab, keeping the query (`/environments/:environmentId/storage`). */
export default function RetiredEnvironmentStorageRoute() {
  return <LegacyProjectRedirect segment="storage" />
}
