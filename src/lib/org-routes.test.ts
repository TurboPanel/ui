import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ORG_AREAS,
  ORG_SIDEBAR_AREA_IDS,
  ORG_TAB_AREA_IDS,
  SERVERS_NETWORK_SUB_ROUTE_IDS,
  defaultOrgDashboardHref,
  orgManageHref,
} from './org-navigation'

/** The organization routes the sidebar, the phone tabs and the picker menu link to exist. */
const ORG_ROOT = path.resolve(__dirname, '../app/[orgId]')

function areaSegment(id: string): string {
  const area = ORG_AREAS.find((entry) => entry.id === id)
  if (!area) throw new Error(`unknown area ${id}`)
  return area.pathSegment
}

describe('organization routes', () => {
  it('has a page for every sidebar area and phone tab', () => {
    const ids = [...ORG_SIDEBAR_AREA_IDS, ...ORG_TAB_AREA_IDS]
    for (const id of ids) {
      const file = path.join(ORG_ROOT, areaSegment(id), 'index.tsx')
      expect(existsSync(file), file).toBe(true)
    }
  })

  it('lands on Projects and keeps the old Overview link working', () => {
    expect(defaultOrgDashboardHref('o')).toBe('/o/projects')
    const overview = readFileSync(path.join(ORG_ROOT, 'overview/index.tsx'), 'utf8')
    expect(overview).toContain('<Redirect')
    expect(overview).toContain('defaultOrgDashboardHref')
  })

  it('opens Organization settings from the picker menu route', () => {
    expect(orgManageHref('o')).toBe('/o/manage')
    expect(existsSync(path.join(ORG_ROOT, 'manage/index.tsx'))).toBe(true)
  })

  it('has a page under Servers for each old Network page, and redirects the old links', () => {
    for (const page of SERVERS_NETWORK_SUB_ROUTE_IDS) {
      expect(existsSync(path.join(ORG_ROOT, 'servers', `${page}.tsx`)), page).toBe(true)
    }
    for (const file of ['network/index.tsx', 'network/[page].tsx', 'access/index.tsx']) {
      const source = readFileSync(path.join(ORG_ROOT, file), 'utf8')
      expect(source, file).toContain('<Redirect')
    }
  })

  it('keeps the pages the settings tabs and old links reach', () => {
    for (const file of [
      'servers/tls.tsx',
      'projects/git-sources/index.tsx',
      'projects/repositories.tsx',
      'billing/index.tsx',
    ]) {
      expect(existsSync(path.join(ORG_ROOT, file)), file).toBe(true)
    }
  })
})
