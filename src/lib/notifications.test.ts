import { describe, expect, it } from 'vitest'
import { useUnreadNotificationCount } from '@/lib/notifications'

describe('useUnreadNotificationCount', () => {
  it('always returns 0 until a notifications API exists', () => {
    expect(useUnreadNotificationCount()).toBe(0)
  })
})
