import { describe, expect, it } from 'vitest'
import { colocatedRepairResultMessage, COLOCATED_REPAIR_HELP } from '@/lib/colocated-repair'

describe('colocatedRepairResultMessage', () => {
  it('says the key was cleared only when it was', () => {
    const base = { ok: true as const, serverId: 'srv-1', reasons: [] }
    expect(colocatedRepairResultMessage({ ...base, clearedKey: true })).toBe(
      'New credentials were written for this server. Its old key was cleared so it can connect again. The daemon reconnects as this same server within a few minutes.'
    )
    expect(colocatedRepairResultMessage({ ...base, clearedKey: false })).toBe(
      'New credentials were written for this server. The daemon reconnects as this same server within a few minutes.'
    )
  })

  it('explains the action in one plain sentence pair', () => {
    expect(COLOCATED_REPAIR_HELP).toBe(
      "Use this when this server's daemon can't connect. It issues new credentials for this same server and restarts the connection."
    )
  })
})
