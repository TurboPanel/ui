import { RetiredManagedTabRedirect } from '@/components/org/project/managed-focus-tab'

/** Old managed `/connect` tab: now a tab of the primary environment. */
export default function ProjectConnectScreen() {
  return <RetiredManagedTabRedirect tab="connect" />
}
