import { describe, expect, it } from 'vitest'
import { serverPinned, terminalEntryAllowed, terminalSwitchOn } from '@/lib/terminal/gate'

describe('terminal entry gate', () => {
  const all = { switchOn: true, canOpen: true, pinned: true, hasContainer: true }

  it('shows only when every condition holds', () => {
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

  it('counts a pinned server by how its key was pinned', () => {
    expect(serverPinned('install')).toBe(true)
    expect(serverPinned('upgrade')).toBe(true)
    expect(serverPinned('unsafe')).toBe(true)
    expect(serverPinned('none')).toBe(false)
    expect(serverPinned(undefined)).toBe(false)
    expect(serverPinned(null)).toBe(false)
  })
})
