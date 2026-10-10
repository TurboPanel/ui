import type { BadgeTone } from '@/components/ui'
import type { OrganizationActivityItem } from '@/lib/instance-api'

const ACTION_LABELS: Record<OrganizationActivityItem['action'], string> = {
  deploy: 'Deploy',
  start: 'Start',
  restart: 'Restart',
  stop: 'Stop',
}

export function activityActionLabel(action: OrganizationActivityItem['action']): string {
  return ACTION_LABELS[action]
}

export function activityStateLabel(state: OrganizationActivityItem['state']): string {
  return state === 'failed' ? 'Failed' : 'In progress'
}

export function activityStateTone(state: OrganizationActivityItem['state']): BadgeTone {
  return state === 'failed' ? 'danger' : 'pending'
}

/** "Project / Environment", degrading to whichever half is known, or a dash. */
export function activityTargetLabel(
  item: Pick<OrganizationActivityItem, 'projectName' | 'environmentName'>
): string {
  const parts = [item.projectName, item.environmentName].filter(
    (part): part is string => typeof part === 'string' && part.length > 0
  )
  return parts.length > 0 ? parts.join(' / ') : '—'
}

/** "1–25 of 237" for the pager; "0 of 0" when empty. */
export function activityRangeLabel(offset: number, shown: number, total: number): string {
  if (total === 0 || shown === 0) return '0 of 0'
  return `${offset + 1}–${offset + shown} of ${total}`
}
