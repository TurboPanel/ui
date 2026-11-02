import { describe, expect, it } from 'vitest'
import {
  environmentConfirmName,
  environmentDeleteFailure,
  environmentDeleteOutcome,
  environmentDeletePrompt,
} from './environment-delete'

describe('environmentDeletePrompt', () => {
  it('names the environment', () => {
    expect(environmentDeletePrompt('Staging')).toContain('"Staging"')
  })
})

describe('environmentDeleteFailure', () => {
  it('asks to stop first when the app is still running', () => {
    const failure = environmentDeleteFailure('environment_running', 'Staging')
    expect(failure.needsStop).toBe(true)
    expect(failure.text).toContain('Stop it first')
    expect(failure.text).toContain('"Staging"')
  })

  it('finds the code inside a wrapped message', () => {
    expect(environmentDeleteFailure('409: environment_running', 'x').needsStop).toBe(true)
  })

  it('does not offer Stop for a managed database', () => {
    const failure = environmentDeleteFailure('managed_runtime_present', 'Prod')
    expect(failure.needsStop).toBe(false)
    expect(failure.text).toContain('Destroy it first')
  })

  it('passes other messages through', () => {
    expect(environmentDeleteFailure('Forbidden', 'Prod')).toEqual({
      text: 'Forbidden',
      needsStop: false,
    })
  })
})

describe('environmentConfirmName', () => {
  it('is the trimmed name, else the id', () => {
    expect(environmentConfirmName({ id: 'env-1', name: ' prod ' })).toBe('prod')
    expect(environmentConfirmName({ id: 'env-1', name: '  ' })).toBe('env-1')
    expect(environmentConfirmName({ id: 'env-1', name: null })).toBe('env-1')
  })
})

describe('environmentDeleteOutcome', () => {
  it('sends a running environment to the Stop notice and keeps other refusals in the dialog', () => {
    expect(environmentDeleteOutcome('environment_running', 'prod')).toMatchObject({
      kind: 'failure',
      failure: { needsStop: true },
    })
    expect(environmentDeleteOutcome('confirm_name_required', 'prod')).toEqual({
      kind: 'in-dialog',
      text: 'confirm_name_required',
    })
  })
})
