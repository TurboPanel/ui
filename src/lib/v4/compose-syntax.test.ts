import { describe, expect, it } from 'vitest'
import { makeComposeTag } from '@/lib/compose/tags'
import { linuxUserAccessPath, LINUX_USER_PATH, servicesAreDetached } from './compose-syntax'

describe('compose syntax', () => {
  it('names the paths of a Linux user', () => {
    expect(LINUX_USER_PATH).toEqual(['x-turbopanel', 'principal'])
    expect(linuxUserAccessPath('web')).toEqual(['x-turbopanel', 'principals', 'web', 'access'])
  })

  it('treats a replaced or emptied services block as cut off from the Base', () => {
    expect(servicesAreDetached(makeComposeTag('override', {}))).toBe(true)
    expect(servicesAreDetached(makeComposeTag('reset', null))).toBe(true)
    expect(servicesAreDetached({ web: {} })).toBe(false)
    expect(servicesAreDetached(undefined)).toBe(false)
  })
})
