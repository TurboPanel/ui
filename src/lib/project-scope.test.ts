import { describe, expect, it } from 'vitest'
import {
  PROJECT_SCOPE_CHIP_MAX_ENVIRONMENTS,
  filterProjectScopeOptions,
  resolveScopeTriggerOption,
  scopeOptionMatchesQuery,
  shouldShowScopeSearch,
  shouldUseScopePicker,
  type ProjectScopeOption,
} from '@/lib/project-scope'

const options: ProjectScopeOption[] = [
  { environmentId: 'env-1', label: 'web-01', detail: 'Online' },
  { environmentId: 'env-2', label: 'web-02', detail: 'Offline' },
  { environmentId: 'env-3', label: 'db-01', detail: 'Online' },
]

describe('scopeOptionMatchesQuery', () => {
  it('matches label, detail, and environment id, case-insensitively', () => {
    expect(scopeOptionMatchesQuery(options[0]!, 'WEB')).toBe(true)
    expect(scopeOptionMatchesQuery(options[0]!, 'online')).toBe(true)
    expect(scopeOptionMatchesQuery(options[0]!, 'env-1')).toBe(true)
    expect(scopeOptionMatchesQuery(options[0]!, 'db')).toBe(false)
  })

  it('matches everything on a blank query', () => {
    expect(scopeOptionMatchesQuery(options[0]!, '   ')).toBe(true)
  })
})

describe('filterProjectScopeOptions', () => {
  it('narrows to matching options and keeps order', () => {
    expect(
      filterProjectScopeOptions(options, 'web').map((o) => o.label),
    ).toEqual(['web-01', 'web-02'])
    expect(filterProjectScopeOptions(options, '')).toHaveLength(3)
    expect(filterProjectScopeOptions(options, 'nothing')).toHaveLength(0)
  })
})

describe('shouldUseScopePicker', () => {
  it('keeps chips for a single environment and picks past that', () => {
    expect(PROJECT_SCOPE_CHIP_MAX_ENVIRONMENTS).toBe(1)
    expect(shouldUseScopePicker(0)).toBe(false)
    expect(shouldUseScopePicker(1)).toBe(false)
    expect(shouldUseScopePicker(2)).toBe(true)
    expect(shouldUseScopePicker(20)).toBe(true)
  })
})

describe('shouldShowScopeSearch', () => {
  it('only shows the filter field on a long list', () => {
    expect(shouldShowScopeSearch(4)).toBe(false)
    expect(shouldShowScopeSearch(20)).toBe(true)
  })
})

describe('resolveScopeTriggerOption', () => {
  it('names the active environment when one is selected', () => {
    expect(resolveScopeTriggerOption(options, 'env-2')?.label).toBe('web-02')
  })

  it('falls back to the first environment on Project scope', () => {
    // Project is selected, so nothing is active — the trigger still names an
    // environment (rendered unhighlighted) rather than going blank.
    expect(resolveScopeTriggerOption(options, null)?.label).toBe('web-01')
  })

  it('falls back to the first when the active id is not in the list', () => {
    expect(resolveScopeTriggerOption(options, 'env-gone')?.label).toBe('web-01')
  })

  it('returns undefined with no environments', () => {
    expect(resolveScopeTriggerOption([], null)).toBeUndefined()
  })
})
