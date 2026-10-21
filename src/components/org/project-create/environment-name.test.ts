import { describe, expect, it } from 'vitest'
import {
  environmentFieldValue,
  environmentNamePayload,
  showsDefaultPill,
} from '@/components/org/project-create/environment-name'

describe('environmentNamePayload', () => {
  it('omits environmentName when the user never edited the field', () => {
    expect(environmentNamePayload(null)).toEqual({})
  })

  it('omits it when the edited field was left empty', () => {
    expect(environmentNamePayload('   ')).toEqual({})
  })

  it('sends the trimmed text when the user edited it', () => {
    expect(environmentNamePayload('  Edge ')).toEqual({
      environmentName: 'Edge',
    })
  })
})

describe('environmentFieldValue', () => {
  it('follows a late-loading default until the user edits', () => {
    expect(environmentFieldValue(null, null)).toBe('')
    expect(environmentFieldValue(null, 'Staging')).toBe('Staging')
    expect(environmentFieldValue('Edge', 'Staging')).toBe('Edge')
  })

  it('keeps an emptied field empty rather than snapping back to the default', () => {
    expect(environmentFieldValue('', 'Staging')).toBe('')
  })
})

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
