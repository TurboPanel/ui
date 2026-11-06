import { describe, expect, it } from 'vitest'
import {
  stepRailComplete,
  stepRailFocus,
  stepRailInfo,
  stepRailLabel,
  stepRailSpoken,
  stepStatesFromCurrent,
  type StepRailState,
} from '@/lib/step-rail'

const STEPS = [
  { id: 'a', label: 'Name' },
  { id: 'b', label: 'Install Command' },
  { id: 'c', label: 'Connect' },
] as const

function states(list: readonly { state: StepRailState }[]): StepRailState[] {
  return list.map((step) => step.state)
}

describe('stepRailInfo', () => {
  it('gives every state a word, and only the running one spins', () => {
    expect(stepRailInfo('running')).toEqual({ word: 'in progress', glyph: 'spinner', tone: 'busy' })
    expect(stepRailInfo('active').glyph).toBeNull()
    expect(stepRailInfo('active').word).toBe('current step')
    expect(stepRailInfo('done').glyph).toBe('check')
    expect(stepRailInfo('failed').tone).toBe('bad')
  })

  it('reads an unknown state as not started', () => {
    expect(stepRailInfo('mystery')).toBe(stepRailInfo('pending'))
  })
})

describe('stepRailLabel and stepRailSpoken', () => {
  it('adds the word where the mark alone would leave a question', () => {
    expect(stepRailLabel({ label: 'Build', state: 'failed' })).toBe('Build · failed')
    expect(stepRailLabel({ label: 'Start', state: 'skipped' })).toBe('Start · skipped')
    expect(stepRailLabel({ label: 'Build', state: 'done' })).toBe('Build')
  })

  it('speaks the position, the label and the state', () => {
    expect(stepRailSpoken({ label: 'Enroll', state: 'running' }, 3, 6)).toBe(
      'Step 4 of 6, Enroll, in progress'
    )
  })
})

describe('stepStatesFromCurrent', () => {
  it('marks steps before the current one done and the rest pending', () => {
    expect(states(stepStatesFromCurrent(STEPS, 'b'))).toEqual(['done', 'active', 'pending'])
    expect(states(stepStatesFromCurrent(STEPS, 'c', 'running'))).toEqual([
      'done',
      'done',
      'running',
    ])
  })

  it('leaves everything pending before anything started, or for an unknown id', () => {
    expect(states(stepStatesFromCurrent(STEPS, null))).toEqual(['pending', 'pending', 'pending'])
    expect(states(stepStatesFromCurrent(STEPS, 'zz' as 'a'))).toEqual([
      'pending',
      'pending',
      'pending',
    ])
  })
})

describe('stepRailComplete', () => {
  it('is true only when every step ended well and one actually ran', () => {
    expect(stepRailComplete([{ state: 'done' }, { state: 'ready' }, { state: 'skipped' }])).toBe(
      true
    )
    expect(stepRailComplete([{ state: 'ready' }])).toBe(false)
    expect(stepRailComplete([{ state: 'done' }, { state: 'failed' }])).toBe(false)
    expect(stepRailComplete([{ state: 'done' }, { state: 'running' }])).toBe(false)
    expect(stepRailComplete([])).toBe(false)
  })
})

describe('stepRailFocus', () => {
  it('picks the failed step, then the running or active one, then the next to run', () => {
    expect(
      stepRailFocus([{ state: 'done' }, { state: 'failed' }, { state: 'running' }])?.index
    ).toBe(1)
    expect(stepRailFocus([{ state: 'done' }, { state: 'running' }])?.index).toBe(1)
    expect(stepRailFocus([{ state: 'done' }, { state: 'active' }])?.index).toBe(1)
    expect(stepRailFocus([{ state: 'done' }, { state: 'pending' }])?.index).toBe(1)
  })

  it('falls back to the last step, and to nothing without steps', () => {
    expect(stepRailFocus([{ state: 'done' }, { state: 'done' }])?.index).toBe(1)
    expect(stepRailFocus([])).toBeNull()
  })
})
