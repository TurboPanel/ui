import { describe, expect, it } from 'vitest'
import {
  isRunnableRecoveryCommand,
  recoveryCommandNamesAttempt,
} from '@/lib/upgrade-recovery'

const RUN_ID = '11111111-1111-4111-8111-111111111111'

function rollback(id: string): string {
  return `sudo -n /opt/turbopanel/share/orchestration/scripts/tp-orchestrate playbook -i localhost, -c local -e turbopanel_upgrade_id=${id} instance-rollback.yml`
}

describe('recovery command', () => {
  it('does not treat a pending placeholder as a command to copy', () => {
    expect(isRunnableRecoveryCommand(rollback('pending'))).toBe(false)
    expect(isRunnableRecoveryCommand(rollback('<upgrade id>'))).toBe(false)
  })

  it('keeps the attempt id that was copied before a restart', () => {
    const copied = rollback(RUN_ID)
    const afterRestart = copied
    expect(isRunnableRecoveryCommand(afterRestart)).toBe(true)
    expect(recoveryCommandNamesAttempt(afterRestart, RUN_ID)).toBe(true)
    expect(recoveryCommandNamesAttempt(afterRestart, 'pending')).toBe(false)
  })
})
