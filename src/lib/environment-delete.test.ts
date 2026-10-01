import { describe, expect, it } from 'vitest'
import { environmentDeleteFailure, environmentDeletePrompt } from './environment-delete'

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
