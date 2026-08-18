import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SSH_PORT,
  configuredSourceLabel,
  formatNtpHostList,
  isEmptyNtpDraft,
  ntpDefaultsFromDrafts,
  parseNtpHostList,
  parseSshPortDraft,
  sshPortSourceLabel,
} from './host-defaults'

describe('host-defaults helpers', () => {
  it('labels configured sources and platform SSH default', () => {
    expect(configuredSourceLabel('server')).toBe('Server override')
    expect(configuredSourceLabel('datacenter')).toBe('Datacenter default')
    expect(configuredSourceLabel('organization')).toBe('Organization default')
    expect(configuredSourceLabel(null)).toBe('Not set')
    expect(sshPortSourceLabel(null)).toBe(`Platform default (${String(DEFAULT_SSH_PORT)})`)
    expect(sshPortSourceLabel('datacenter')).toBe('Datacenter default')
  })

  it('parses SSH port drafts', () => {
    expect(parseSshPortDraft('2222')).toBe(2222)
    expect(parseSshPortDraft('')).toBeNull()
    expect(parseSshPortDraft('22.5')).toBeNull()
    expect(parseSshPortDraft('0')).toBeNull()
    expect(parseSshPortDraft('65536')).toBeNull()
  })

  it('round-trips NTP host lists', () => {
    expect(parseNtpHostList('time.cloudflare.com, pool.ntp.org')).toEqual([
      'time.cloudflare.com',
      'pool.ntp.org',
    ])
    expect(formatNtpHostList(['time.google.com'])).toBe('time.google.com')
    expect(formatNtpHostList(undefined)).toBe('')
  })

  it('builds NTP defaults from drafts and treats empty+off as inherit', () => {
    expect(ntpDefaultsFromDrafts(true, 'pool.ntp.org', '')).toEqual({
      enabled: true,
      servers: ['pool.ntp.org'],
    })
    expect(isEmptyNtpDraft(false, '', '  ')).toBe(true)
    expect(isEmptyNtpDraft(true, '', '')).toBe(false)
  })
})
