import { RetiredManagedTabRedirect } from '@/components/org/project/managed-focus-tab'

/** Old managed `/data` tab: now a tab of the primary environment. */
export default function ProjectDataScreen() {
  return <RetiredManagedTabRedirect tab="data" />
}
