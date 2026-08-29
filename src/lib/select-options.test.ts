import { describe, expect, it } from 'vitest'
import {
  filterSelectOptions,
  resolveSelectTriggerLabel,
  SELECT_SEARCH_MIN,
  selectOptionMatchesQuery,
  shouldShowSelectSearch,
  type SelectOption,
} from './select-options'

const timezones: readonly SelectOption[] = [
  { value: 'America/New_York', label: 'America/New_York' },
  { value: 'America/Chicago', label: 'America/Chicago' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin' },
  { value: 'UTC', label: 'UTC' },
]

describe('selectOptionMatchesQuery', () => {
  it('matches everything on an empty or whitespace query', () => {
    for (const option of timezones) {
      expect(selectOptionMatchesQuery(option, '')).toBe(true)
      expect(selectOptionMatchesQuery(option, '   ')).toBe(true)
    }
  })

  it('matches case-insensitively on the label', () => {
    expect(selectOptionMatchesQuery(timezones[2], 'berlin')).toBe(true)
    expect(selectOptionMatchesQuery(timezones[2], 'BERLIN')).toBe(true)
    expect(selectOptionMatchesQuery(timezones[2], 'tokyo')).toBe(false)
  })

  it('treats spaces and underscores as equivalent', () => {
    expect(selectOptionMatchesQuery(timezones[0], 'new york')).toBe(true)
    expect(selectOptionMatchesQuery(timezones[0], 'New_York')).toBe(true)
  })

  it('matches on detail and value as fallbacks', () => {
    const option: SelectOption = {
      value: 'srv-1',
      label: 'edge-1',
      detail: 'Frankfurt rack 2',
    }
    expect(selectOptionMatchesQuery(option, 'frankfurt')).toBe(true)
    expect(selectOptionMatchesQuery(option, 'srv-1')).toBe(true)
  })
})

describe('filterSelectOptions', () => {
  it('keeps only matching options in order', () => {
    expect(filterSelectOptions(timezones, 'america').map((o) => o.value)).toEqual(
      ['America/New_York', 'America/Chicago'],
    )
  })

  it('returns everything for an empty query', () => {
    expect(filterSelectOptions(timezones, '')).toHaveLength(timezones.length)
  })
})

describe('shouldShowSelectSearch', () => {
  it('hides search below the threshold and shows it at the threshold', () => {
    expect(shouldShowSelectSearch(SELECT_SEARCH_MIN - 1)).toBe(false)
    expect(shouldShowSelectSearch(SELECT_SEARCH_MIN)).toBe(true)
  })
})

describe('resolveSelectTriggerLabel', () => {
  it('shows the selected option label', () => {
    expect(
      resolveSelectTriggerLabel(timezones, 'Europe/Berlin', 'Select…'),
    ).toEqual({ label: 'Europe/Berlin', isPlaceholder: false })
  })

  it('shows the none label for a null value when offered', () => {
    expect(
      resolveSelectTriggerLabel(timezones, null, 'Select…', 'Inherit default'),
    ).toEqual({ label: 'Inherit default', isPlaceholder: false })
  })

  it('shows the placeholder for a null value without a none option', () => {
    expect(resolveSelectTriggerLabel(timezones, null, 'Select…')).toEqual({
      label: 'Select…',
      isPlaceholder: true,
    })
  })

  it('names a saved value even before it appears in options', () => {
    expect(resolveSelectTriggerLabel([], 'Asia/Tokyo', 'Select…')).toEqual({
      label: 'Asia/Tokyo',
      isPlaceholder: false,
    })
  })
})
