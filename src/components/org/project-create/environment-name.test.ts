import { describe, expect, it } from 'vitest'
import { showsDefaultPill } from '@/components/org/project-create/environment-name'

describe('showsDefaultPill', () => {
  it('shows only while the value equals a resolved default', () => {
    expect(showsDefaultPill('Staging', 'Staging')).toBe(true)
    expect(showsDefaultPill('Edge', 'Staging')).toBe(false)
  })

  it('never shows when the default is unknown (loading, 403 or error)', () => {
    expect(showsDefaultPill('', null)).toBe(false)
    expect(showsDefaultPill('production', null)).toBe(false)
  })
})
