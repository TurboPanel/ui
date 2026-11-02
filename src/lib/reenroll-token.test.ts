import { describe, expect, it } from 'vitest'
import { reenrollCommandText, reenrollExpiryLabel, reenrollTokenIsLive } from './reenroll-token'

const NOW = Date.parse('2026-11-01T12:00:00Z')
const at = (ms: number) => new Date(NOW + ms).toISOString()

describe('reenrollExpiryLabel', () => {
  it('counts minutes left', () => {
    expect(reenrollExpiryLabel(at(60 * 60_000), NOW)).toBe('Expires in 60 minutes')
    expect(reenrollExpiryLabel(at(90_000), NOW)).toBe('Expires in 1 minute')
    expect(reenrollExpiryLabel(at(30_000), NOW)).toBe('Expires in less than a minute')
  })

  it('says Expired at or past the deadline and for garbage', () => {
    expect(reenrollExpiryLabel(at(0), NOW)).toBe('Expired')
    expect(reenrollExpiryLabel(at(-1000), NOW)).toBe('Expired')
    expect(reenrollExpiryLabel('nope', NOW)).toBe('Expired')
  })
})

describe('reenrollTokenIsLive', () => {
  it('is true only before the deadline', () => {
    expect(reenrollTokenIsLive(at(1000), NOW)).toBe(true)
    expect(reenrollTokenIsLive(at(0), NOW)).toBe(false)
  })
})

describe('reenrollCommandText', () => {
  it('prefers the full command and falls back to the installer value', () => {
    expect(reenrollCommandText({ installCommand: 'curl x | sh', licenseArg: 'abc' })).toBe(
      'curl x | sh'
    )
    expect(reenrollCommandText({ licenseArg: 'abc' })).toBe('TURBOPANEL_LICENSE=abc')
  })
})
