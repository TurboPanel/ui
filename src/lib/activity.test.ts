import { describe, expect, it } from 'vitest'
import {
  activityActionLabel,
  activityRangeLabel,
  activityStateLabel,
  activityStateTone,
  activityTargetLabel,
} from '@/lib/activity'

describe('activity labels', () => {
  it('names actions and states in plain words', () => {
    expect(activityActionLabel('deploy')).toBe('Deploy')
    expect(activityActionLabel('restart')).toBe('Restart')
    expect(activityStateLabel('deploying')).toBe('In progress')
    expect(activityStateLabel('failed')).toBe('Failed')
    expect(activityStateTone('failed')).toBe('danger')
    expect(activityStateTone('deploying')).toBe('pending')
  })

  it('joins project and environment, degrading to what is known', () => {
    expect(activityTargetLabel({ projectName: 'My App', environmentName: 'Production' })).toBe(
      'My App / Production'
    )
    expect(activityTargetLabel({ projectName: 'My App', environmentName: null })).toBe('My App')
    expect(activityTargetLabel({ projectName: null, environmentName: null })).toBe('—')
  })

  it('reads the pager range', () => {
    expect(activityRangeLabel(0, 25, 237)).toBe('1–25 of 237')
    expect(activityRangeLabel(225, 12, 237)).toBe('226–237 of 237')
    expect(activityRangeLabel(0, 0, 0)).toBe('0 of 0')
  })
})
