import { describe, expect, it } from 'vitest'
import {
  environmentDeleteFailure,
  environmentDeleteInput,
  environmentDeleteInput,
  environmentDeleteNeedsName,
  environmentDeleteOutcome,
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

describe('environmentDeleteNeedsName', () => {
  it('recognises the control plane asking for the name', () => {
    expect(environmentDeleteNeedsName('confirm_name_required')).toBe(true)
    expect(environmentDeleteNeedsName('environment_running')).toBe(false)
  })
})

describe('environmentDeleteInput', () => {
  it('is the bare id until a name is typed', () => {
    expect(environmentDeleteInput('env-1')).toBe('env-1')
    expect(environmentDeleteInput('env-1', 'prod')).toEqual({ id: 'env-1', confirmName: 'prod' })
  })
})

describe('environmentDeleteOutcome', () => {
  it('asks for the name on the first refusal, then keeps errors inside the dialog', () => {
    expect(environmentDeleteOutcome('confirm_name_required', 'prod')).toEqual({ kind: 'ask-name' })
    expect(environmentDeleteOutcome('environment_running', 'prod')).toMatchObject({
      kind: 'failure',
      failure: { needsStop: true },
    })
    expect(environmentDeleteOutcome('confirm_name_required', 'prod', 'pro')).toMatchObject({
      kind: 'name-error',
    })
  })
})
