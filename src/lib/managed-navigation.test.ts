import { describe, expect, it } from 'vitest'
import {
  MANAGED_BY_TURBOPANEL,
  managedEnvironmentTabs,
  managedProjectTabs,
  retiredManagedTabHref,
} from '@/lib/managed-navigation'
import {
  ENVIRONMENT_PAGE_TAB_IDS,
  PROJECT_PAGE_TAB_IDS,
  environmentPageTabHref,
} from '@/lib/project-navigation'

const mutedKeys = (tabs: ReturnType<typeof managedEnvironmentTabs>) =>
  tabs.filter((tab) => tab.muted).map((tab) => tab.key)

describe('managed tab bars', () => {
  it('keeps every website environment tab, at most seven, with only Compose greyed', () => {
    const tabs = managedEnvironmentTabs()
    expect(tabs.map((tab) => tab.key)).toEqual([...ENVIRONMENT_PAGE_TAB_IDS])
    expect(tabs.length).toBeLessThanOrEqual(7)
    expect(tabs.map((tab) => tab.label)).toEqual([
      'Overview',
      'Deployments',
      'Services',
      'Compose',
      'Bindings',
      'Hosting',
      'Settings',
    ])
    expect(mutedKeys(tabs)).toEqual(['compose'])
    expect(tabs.find((tab) => tab.muted)?.mutedLabel).toBe(MANAGED_BY_TURBOPANEL)
  })

  it('keeps every website project tab, with Base and Compose greyed', () => {
    const tabs = managedProjectTabs()
    expect(tabs.map((tab) => tab.key)).toEqual([...PROJECT_PAGE_TAB_IDS])
    expect(mutedKeys(tabs)).toEqual(['base', 'compose'])
  })
})

describe('retired managed tabs', () => {
  it('open the environment tab that holds them now', () => {
    expect(retiredManagedTabHref('o', 'p', 'connect', 'e')).toBe(
      environmentPageTabHref('o', 'p', 'e', 'bindings')
    )
    expect(retiredManagedTabHref('o', 'p', 'data', 'e')).toBe(
      '/o/projects/p/environments/e/configuration'
    )
    expect(retiredManagedTabHref('o', 'p', 'backups', 'e')).toBe(
      '/o/projects/p/environments/e/deployments'
    )
  })

  it('open the Environments tab when there is no environment yet', () => {
    expect(retiredManagedTabHref('o', 'p', 'connect', null)).toBe('/o/projects/p/overview')
  })
})
