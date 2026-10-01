import { describe, expect, it } from 'vitest'
import { hostPickerLabel, pickHostKey } from './hosting-host-label'

describe('hostPickerLabel', () => {
  it('names a web route by its first hostname and counts the rest', () => {
    const base = { composeServiceName: 'web', protocol: 'http' as const }
    expect(hostPickerLabel({ ...base, hostnames: 'blog.example.com' })).toBe('blog.example.com')
    expect(
      hostPickerLabel({ ...base, hostnames: 'a.example.com, b.example.com, c.example.com' })
    ).toBe('a.example.com +2')
  })

  it('falls back to the service when there is no hostname or it is a raw port', () => {
    expect(hostPickerLabel({ hostnames: ' , ', composeServiceName: 'web', protocol: 'http' })).toBe(
      'web · no hostname'
    )
    expect(hostPickerLabel({ hostnames: '', composeServiceName: 'db', protocol: 'tcp' })).toBe(
      'db · tcp'
    )
  })
})

describe('pickHostKey', () => {
  const keys = ['a', 'b', 'c']
  it('prefers the pick, then the deep-linked row, then the first', () => {
    expect(pickHostKey(keys, 'b', 'c')).toBe('b')
    expect(pickHostKey(keys, null, 'c')).toBe('c')
    expect(pickHostKey(keys, 'gone', null)).toBe('a')
    expect(pickHostKey([], null, null)).toBeNull()
  })
})
