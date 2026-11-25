import { describe, expect, it } from 'vitest'
import {
  binaryStringBytes,
  isValidLoginUser,
  terminalEntryAllowed,
  terminalSwitchOn,
} from '@/lib/terminal/gate'

describe('terminal entry gate', () => {
  const all = { switchOn: true, canOpen: true }

  it('shows only when the switch is on and the person may open one', () => {
    expect(terminalEntryAllowed(all)).toBe(true)
    for (const key of Object.keys(all) as (keyof typeof all)[]) {
      expect(terminalEntryAllowed({ ...all, [key]: false })).toBe(false)
    }
  })

  it('reads the switch as on only for a literal true', () => {
    expect(terminalSwitchOn({ terminal: { container: true } })).toBe(true)
    expect(terminalSwitchOn({ terminal: { container: 'true' } })).toBe(false)
    expect(terminalSwitchOn({ terminal: { container: false } })).toBe(false)
    expect(terminalSwitchOn({ terminal: null })).toBe(false)
    expect(terminalSwitchOn({ terminal: 'yes' })).toBe(false)
    expect(terminalSwitchOn({})).toBe(false)
    expect(terminalSwitchOn(null)).toBe(false)
    expect(terminalSwitchOn(undefined)).toBe(false)
  })
})

describe('login user and binary input', () => {
  it('checks the login user like the control plane', () => {
    for (const ok of ['root', 'www-data', '_apt', '1000', '1000:1000']) {
      expect(isValidLoginUser(ok)).toBe(true)
    }
    for (const bad of ['', 'Root', 'a b', '-x', '1:2:3', 'a'.repeat(33), '12345678901']) {
      expect(isValidLoginUser(bad)).toBe(false)
    }
  })

  it('turns an xterm binary string into bytes', () => {
    expect(Array.from(binaryStringBytes('\x00\x1b\xff'))).toEqual([0, 27, 255])
    expect(binaryStringBytes('')).toHaveLength(0)
  })
})
