import { describe, expect, it } from 'vitest'
import { WAITING_POLL_MS, waitingHostNote } from '@/lib/add-server-waiting'

describe('add server waiting step', () => {
  it('checks for the new host every second', () => {
    expect(WAITING_POLL_MS).toBe(1000)
  })

  it('tells the person a new host needs a minute or two to set itself up', () => {
    expect(waitingHostNote(0)).toMatch(/setting itself up/)
    expect(waitingHostNote(0)).toMatch(/a minute or two/)
  })

  it('says it is taking longer than usual after three minutes', () => {
    expect(waitingHostNote(179)).not.toMatch(/longer than usual/)
    expect(waitingHostNote(180)).toMatch(/longer than usual/)
    expect(waitingHostNote(180)).toMatch(/installer/)
  })
})
