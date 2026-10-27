import { afterEach, describe, expect, it } from 'vitest'
import {
  forgetSessionChoices,
  recallSessionChoices,
  rememberSessionChoices,
} from './session-choices'

afterEach(forgetSessionChoices)

describe('session choices', () => {
  it('keeps the last choices per key until forgotten', () => {
    expect(recallSessionChoices('form:o1')).toBeUndefined()
    rememberSessionChoices('form:o1', { job: 'read-only' })
    rememberSessionChoices('form:o1', { job: 'owner' })
    rememberSessionChoices('form:o2', { job: 'read-write' })
    expect(recallSessionChoices('form:o1')).toEqual({ job: 'owner' })
    expect(recallSessionChoices('form:o2')).toEqual({ job: 'read-write' })
    forgetSessionChoices()
    expect(recallSessionChoices('form:o1')).toBeUndefined()
  })
})
