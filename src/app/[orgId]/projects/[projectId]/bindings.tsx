import { LegacyProjectRedirect } from '@/components/org/project/project-route-screens'

/** Retired route: redirects to its new tab, keeping the query (`/projects/:projectId/bindings`). */
export default function RetiredBindingsRoute() {
  return <LegacyProjectRedirect segment="bindings" />
}
