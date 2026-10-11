import { describe, expect, it } from 'vitest'
import {
  BUSY_REASON,
  DESTROY_EXPLANATION,
  LAST_ENVIRONMENT_REASON,
  NO_LINUX_USER_REASON,
  NO_SERVER_REASON,
  environmentActionItems,
  type EnvironmentActionInput,
} from './environment-menu'

const base: EnvironmentActionInput = {
  canOwn: true,
  canMutate: true,
  environmentCount: 2,
  hasServer: true,
  needsPrincipal: false,
  hasContainers: true,
  isRunning: true,
  busy: false,
}

const ids = (input: EnvironmentActionInput) =>
  environmentActionItems(input).map((entry) => entry.id)

describe('environmentActionItems', () => {
  it('offers everything to an owner of a running environment', () => {
    expect(ids(base)).toEqual([
      'preview-merged',
      'preview-prepared',
      'cacheless',
      'stop',
      'refresh',
      'settings',
      'destroy',
      'delete',
    ])
    expect(
      environmentActionItems(base).every((entry) => entry.disabledReason === null),
    ).toBe(true)
  })

  it('gives people who cannot manage only the previews and Refresh', () => {
    expect(ids({ ...base, canOwn: false, canMutate: false })).toEqual([
      'preview-merged',
      'preview-prepared',
      'refresh',
    ])
  })

  it('gives managers who do not own the environment no settings or delete', () => {
    expect(ids({ ...base, canOwn: false })).toEqual([
      'preview-merged',
      'preview-prepared',
      'cacheless',
      'stop',
      'refresh',
      'destroy',
    ])
  })

  it('leaves redeploy and stop out until something has been deployed', () => {
    expect(ids({ ...base, hasContainers: false, isRunning: false })).not.toContain(
      'cacheless',
    )
    expect(ids({ ...base, hasContainers: false, isRunning: false })).not.toContain(
      'stop',
    )
  })

  it('leaves Stop out of a stopped environment', () => {
    const stopped = ids({ ...base, isRunning: false })
    expect(stopped).toContain('cacheless')
    expect(stopped).not.toContain('stop')
  })

  it('says why a redeploy cannot start', () => {
    const reason = (input: EnvironmentActionInput) =>
      environmentActionItems(input).find((entry) => entry.id === 'cacheless')
        ?.disabledReason
    expect(reason({ ...base, busy: true })).toBe(BUSY_REASON)
    expect(reason({ ...base, hasServer: false })).toBe(NO_SERVER_REASON)
    expect(reason({ ...base, needsPrincipal: true })).toBe(NO_LINUX_USER_REASON)
  })

  it('disables the actions while something is already running', () => {
    const entries = environmentActionItems({ ...base, busy: true })
    for (const id of ['preview-merged', 'stop', 'refresh', 'destroy']) {
      expect(entries.find((entry) => entry.id === id)?.disabledReason).toBe(BUSY_REASON)
    }
    expect(entries.find((entry) => entry.id === 'settings')?.disabledReason).toBeNull()
  })

  it('explains why delete is unavailable for the last environment', () => {
    const entries = environmentActionItems({ ...base, environmentCount: 1 })
    expect(entries.find((entry) => entry.id === 'delete')?.disabledReason).toBe(
      LAST_ENVIRONMENT_REASON,
    )
  })

  it('marks destroy and delete as dangerous and explains destroy', () => {
    const entries = environmentActionItems(base)
    const destroy = entries.find((entry) => entry.id === 'destroy')
    expect(destroy?.tone).toBe('danger')
    expect(destroy?.hint).toBe(DESTROY_EXPLANATION)
    expect(entries.find((entry) => entry.id === 'delete')?.tone).toBe('danger')
    expect(entries.find((entry) => entry.id === 'refresh')?.tone).toBe('default')
  })
})

describe('destroy copy', () => {
  it('says what destroy keeps and what removes it', () => {
    expect(DESTROY_EXPLANATION).toContain('The environment and its settings stay')
    expect(DESTROY_EXPLANATION).toContain('Delete environment')
  })
})
