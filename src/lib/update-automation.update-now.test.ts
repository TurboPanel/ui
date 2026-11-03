import { describe, expect, it } from 'vitest'
import { UpdateNowRefusedError } from '@/lib/instance-api'
import {
  CHECK_NOW_PAUSED_HELP,
  CHECK_NOW_UPDATE_NOW_HELP,
  checkNowHelp,
  UPDATE_NOW_DEVELOPMENT,
  UPDATE_NOW_PAUSED_HINT,
  UPDATE_NOW_RUN_ACTIVE,
  UPDATE_NOW_UNREACHABLE,
  updateNowRefusal,
} from './update-automation'

function refused(
  code: UpdateNowRefusedError['code'],
  message: string | null = null,
  retryAfterSeconds: number | null = null
) {
  return new UpdateNowRefusedError('POST failed', code, message, null, retryAfterSeconds)
}

describe('Update Now words', () => {
  it('says Update Now installs right away where it is offered', () => {
    expect(checkNowHelp(false, true)).toBe(CHECK_NOW_UPDATE_NOW_HELP)
    expect(CHECK_NOW_UPDATE_NOW_HELP).toBe(
      'Check Now only looks for new builds. Update Now installs a newer build right away; otherwise the next scheduled check starts it.'
    )
    // Paused, nothing starts, Update Now or not.
    expect(checkNowHelp(true, true)).toBe(CHECK_NOW_PAUSED_HELP)
  })

  it('names each refusal in plain words', () => {
    expect(updateNowRefusal(refused('run_active'))).toBe(UPDATE_NOW_RUN_ACTIVE)
    expect(updateNowRefusal(refused('paused'))).toBe(UPDATE_NOW_PAUSED_HINT)
    expect(UPDATE_NOW_PAUSED_HINT).toBe('Resume updates to update now.')
    expect(updateNowRefusal(refused('development'))).toBe(UPDATE_NOW_DEVELOPMENT)
  })

  it('says what holds a blocked update, from the control plane', () => {
    expect(
      updateNowRefusal(refused('update_blocked', 'The channel target could not be resolved.'))
    ).toBe('The channel target could not be resolved.')
    expect(updateNowRefusal(refused('update_blocked'))).toBe('The update could not start.')
  })

  it('says the release server could not be reached, never up to date', () => {
    expect(updateNowRefusal(refused('release_unreachable'))).toBe(UPDATE_NOW_UNREACHABLE)
    expect(UPDATE_NOW_UNREACHABLE).toBe(
      'The release server could not be reached. Try again in a few minutes.'
    )
  })

  it('says how long to wait after a press too soon', () => {
    expect(updateNowRefusal(refused('check_too_soon', null, 42))).toBe(
      'Wait 42 seconds before trying again.'
    )
    expect(updateNowRefusal(refused('check_too_soon', null, 0.3))).toBe(
      'Wait 1 second before trying again.'
    )
    expect(updateNowRefusal(refused('check_too_soon'))).toBe('Wait a minute before trying again.')
  })

  it('falls back to the plain error for anything else', () => {
    expect(updateNowRefusal(null)).toBe('Could not start the update')
  })
})
