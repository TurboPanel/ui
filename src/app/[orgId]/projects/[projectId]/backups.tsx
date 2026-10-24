import { RetiredManagedTabRedirect } from '@/components/org/project/managed-focus-tab'

/** Old managed `/backups` tab: now a tab of the primary environment. */
export default function ProjectBackupsScreen() {
  return <RetiredManagedTabRedirect tab="backups" />
}
