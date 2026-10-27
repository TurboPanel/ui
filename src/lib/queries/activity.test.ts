import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_IDLE_POLL_MS,
  ACTIVITY_POLL_MS,
  activityPollInterval,
} from '@/lib/queries/activity'
import type { OrganizationActivityPage } from '@/lib/instance-api'

function page(states: string[]): OrganizationActivityPage {
  return {
    ok: true,
    items: states.map((state) => ({ state }) as OrganizationActivityPage['items'][number]),
    total: states.length,
    hasMore: false,
  }
}

describe('activityPollInterval', () => {
  it('polls fast only while the page shows work in progress', () => {
    expect(activityPollInterval(page(['succeeded', 'deploying']))).toBe(ACTIVITY_POLL_MS)
    expect(activityPollInterval(page(['queued']))).toBe(ACTIVITY_POLL_MS)
    expect(activityPollInterval(page(['succeeded', 'failed']))).toBe(ACTIVITY_IDLE_POLL_MS)
    expect(activityPollInterval(undefined)).toBe(ACTIVITY_IDLE_POLL_MS)
  })
})
