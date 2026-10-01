import { describe, expect, it } from 'vitest'
import { taxDefaultNoticeContent } from './tax-default-notice'

describe('taxDefaultNoticeContent', () => {
  it('explains inclusive and exclusive defaults as info', () => {
    const c = taxDefaultNoticeContent('exclusive')
    expect(c.tone).toBe('info')
    expect(c.title).toBe('Prices are tax exclusive by default')
  })

  it('treats inferred_by_currency as a resolved info default', () => {
    const c = taxDefaultNoticeContent('inferred_by_currency')
    expect(c.tone).toBe('info')
    expect(c.title).toBe("Prices follow the account's automatic tax setting")
    expect(c.body).toContain('USD and CAD')
    expect(c.body).toContain('verify normally')
  })

  it('warns accurately when the default is unreadable or unset', () => {
    const c = taxDefaultNoticeContent(null)
    expect(c.tone).toBe('warning')
    expect(c.title).toBe("We could not read the account's tax default")
    expect(c.body).toContain('did not answer or no default is set')
  })
})
