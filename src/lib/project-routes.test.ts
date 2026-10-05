import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COMPOSE_PROJECT_TAB_IDS,
  ENVIRONMENT_PAGE_TAB_IDS,
  LEGACY_PROJECT_SEGMENTS,
  PROJECT_PAGE_TAB_IDS,
  environmentPageTabHref,
  legacyProjectRedirectHref,
  projectComposeSectionHref,
  projectPageTabHref,
} from './project-navigation'

/**
 * Every link the app builds for a project or environment page has to land on a
 * route file, and every retired path has to keep its redirect route. These
 * tests read the route tree, so a renamed or deleted file fails here instead
 * of becoming a dead link.
 */
const APP_ROOT = path.resolve(__dirname, '../app/[orgId]/projects/[projectId]')

/** `/o/projects/p/environments/e/configuration` → the route file's base path. */
function routeBase(href: string): string {
  const relative = href
    .replace('/o/projects/p', '')
    .replace('/environments/e', '/environments/[environmentId]')
  return path.join(APP_ROOT, relative)
}

function routeFileFor(href: string): string | null {
  const base = routeBase(href)
  for (const candidate of [`${base}.tsx`, path.join(base, 'index.tsx')]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

describe('route files behind the links', () => {
  it('has a route for every tab', () => {
    for (const id of PROJECT_PAGE_TAB_IDS) {
      const href = projectPageTabHref('o', 'p', id)
      expect(routeFileFor(href), href).not.toBeNull()
    }
    for (const id of ENVIRONMENT_PAGE_TAB_IDS) {
      const href = environmentPageTabHref('o', 'p', 'e', id)
      expect(routeFileFor(href), href).not.toBeNull()
    }
  })

  it('has a route for every lens at project and environment scope', () => {
    for (const lens of COMPOSE_PROJECT_TAB_IDS) {
      for (const env of [null, 'e']) {
        const href = projectComposeSectionHref('o', 'p', lens, env)
        expect(routeFileFor(href), href).not.toBeNull()
      }
    }
  })

  it('keeps one redirect route per retired path, at both scopes', () => {
    for (const segment of LEGACY_PROJECT_SEGMENTS) {
      for (const base of ['/o/projects/p', '/o/projects/p/environments/e']) {
        const href = `${base}/${segment}`
        const file = routeFileFor(href)
        expect(file, href).not.toBeNull()
        expect(readFileSync(file as string, 'utf8')).toContain(
          `<LegacyProjectRedirect segment="${segment}" />`,
        )
      }
    }
  })

  it('redirects every retired path to a route that exists', () => {
    for (const segment of LEGACY_PROJECT_SEGMENTS) {
      for (const env of [null, 'e']) {
        const target = legacyProjectRedirectHref('o', 'p', segment, env)
        expect(target, `${segment} ${env ?? 'project'}`).not.toBeNull()
        expect(routeFileFor(target as string), target as string).not.toBeNull()
      }
    }
  })

  it('keeps service detail and the environment index where links expect them', () => {
    expect(existsSync(path.join(APP_ROOT, 'services/[serviceId].tsx'))).toBe(true)
    expect(existsSync(path.join(APP_ROOT, 'environments/index.tsx'))).toBe(true)
    expect(
      existsSync(path.join(APP_ROOT, 'environments/[environmentId]/_layout.tsx')),
    ).toBe(true)
  })
})
