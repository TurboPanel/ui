import { describe, expect, it } from 'vitest'
import {
  countHint,
  primaryButtonCopy,
  removeNoticeTitle,
  restoreNoticeCopy,
  whenLabel,
} from './license-dialog-copy'

const OCT_26 = '2026-10-26T00:00:00.000Z'
const oct26 = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
  new Date(OCT_26)
)

describe('whenLabel', () => {
  it('dates the change, or says the end of the period', () => {
    expect(whenLabel(OCT_26)).toBe(`on ${oct26}`)
    expect(whenLabel(null)).toBe('at the end of the period')
  })
})

describe('restoreNoticeCopy', () => {
  it('explains an Add that became a Restore, pluralised with the tier label', () => {
    const one = restoreNoticeCopy({ label: 'S1', ending: 1, endsAt: OCT_26 }, true)
    expect(one.title).toBe(`You have 1 S1 license ending on ${oct26}`)
    expect(one.body).toContain('Restore those first')
    expect(restoreNoticeCopy({ label: 'S1', ending: 3, endsAt: null }, true).title).toBe(
      'You have 3 S1 licenses ending at the end of the period'
    )
  })

  it('says a plain Restore is free, with the date or a fallback', () => {
    expect(restoreNoticeCopy({ label: 'S1', ending: 2, endsAt: OCT_26 }, false)).toEqual({
      title: 'Free — nothing is charged',
      body: `Restored licenses stay yours past ${oct26} and can take a new server right away.`,
    })
    expect(restoreNoticeCopy({ label: 'S1', ending: 2, endsAt: null }, false).body).toBe(
      'Restored licenses stay yours past the end of the period and can take a new server right away.'
    )
  })
})

describe('removeNoticeTitle', () => {
  it('pluralises the count and dates the end', () => {
    expect(removeNoticeTitle(1, OCT_26)).toBe(`1 license ends on ${oct26}`)
    expect(removeNoticeTitle(3, null)).toBe('3 licenses end at the end of the period')
    expect(removeNoticeTitle(null, OCT_26)).toBe(`Licenses end on ${oct26}`)
  })
})

describe('primaryButtonCopy', () => {
  it('labels Restore and Remove with the count, trimmed when there is none', () => {
    expect(primaryButtonCopy('restore', 2, false)).toEqual({
      label: 'Restore 2',
      action: 'confirm',
    })
    expect(primaryButtonCopy('restore', null, false)).toEqual({
      label: 'Restore',
      action: 'confirm',
    })
    expect(primaryButtonCopy('remove', 4, true)).toEqual({ label: 'Remove 4', action: 'confirm' })
    expect(primaryButtonCopy('remove', null, false)).toEqual({ label: 'Remove', action: 'confirm' })
  })

  it('asks for a quote before an Add can be confirmed', () => {
    expect(primaryButtonCopy('add', 1, false)).toEqual({ label: 'Review price', action: 'review' })
    expect(primaryButtonCopy('add', 1, true)).toEqual({
      label: 'Confirm and pay',
      action: 'confirm',
    })
  })
})

describe('countHint', () => {
  const tier = { label: 'S1', ending: 2, endsAt: OCT_26, removable: 5 }
  it('states the ceiling for each mode', () => {
    expect(countHint('restore', tier)).toBe(`Up to 2 (2 end ${oct26}).`)
    expect(countHint('remove', tier)).toBe(
      'Up to 5 — licenses covering a server cannot be removed.'
    )
    expect(countHint('add', tier)).toBe(
      'Charged now for the rest of this period, then monthly with your other licenses.'
    )
  })
})
