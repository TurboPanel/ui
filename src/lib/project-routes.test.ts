import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COMPOSE_PROJECT_TAB_IDS,
  ENVIRONMENT_PAGE_TAB_IDS,
  LEGACY_PROJECT_SEGMENTS,
  MANAGED_PROJECT_TAB_IDS,
  PROJECT_PAGE_TAB_IDS,
  environmentPageTabHref,
  legacyProjectRedirectHref,
  projectComposeEditHref,
  projectComposeSectionHref,
  projectEnvironmentDeploymentHref,
  projectEnvironmentServiceHref,
  projectEnvironmentStorageHref,
  projectHref,
  projectPageTabHref,
  projectServiceHref,
  projectSetupHref,
  projectTabHref,
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
    expect(
      existsSync(path.join(APP_ROOT, 'environments/[environmentId]/services/[serviceId].tsx'))
    ).toBe(true)
    expect(existsSync(path.join(APP_ROOT, 'environments/index.tsx'))).toBe(true)
    expect(
      existsSync(path.join(APP_ROOT, 'environments/[environmentId]/_layout.tsx')),
    ).toBe(true)
  })
})

/** `/o/projects/p/environments/e/configuration` → `environments/[environmentId]/configuration`. */
function routeKey(href: string): string {
  return href
    .replace('/o/projects/p', '')
    .replace('/environments/e', '/environments/[environmentId]')
    .replace('/services/svc', '/services/[serviceId]')
    .replace('/deployments/d', '/deployments/[deploymentId]')
    .replace(/^\//, '')
}

/** Every screen route under a project, as a route key (`_layout` files excluded). */
function routeKeys(dir = APP_ROOT, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const name = entry.name
    if (entry.isDirectory()) return routeKeys(path.join(dir, name), `${prefix}${name}/`)
    if (!name.endsWith('.tsx') || name === '_layout.tsx') return []
    const key = `${prefix}${name.slice(0, -'.tsx'.length)}`
    return [key === 'index' ? '' : key.replace(/\/index$/, '')]
  })
}

/**
 * Routes no tab bar links to, each with the link that reaches it. Kept next
 * to the bars so removing a link (or a route) fails here instead of leaving a
 * screen nobody can open.
 */
const OFF_BAR_ROUTES: readonly (readonly [href: string, reachedBy: string])[] = [
  [projectHref('o', 'p'), 'project lists and the breadcrumb; redirects to a tab'],
  [projectSetupHref('o', 'p'), 'the project index sends a project that needs setup here'],
  [
    projectServiceHref('o', 'p', 'svc'),
    "a database's connected services and older links; redirects to the service in its environment",
  ],
  [
    projectEnvironmentServiceHref('o', 'p', 'e', 'svc'),
    'service rows on the Services tab, the environment overview and its map (lights Services)',
  ],
  [
    projectComposeEditHref('o', 'p', { view: 'visual' }),
    "the Base Compose editor's Compose / Services toggle",
  ],
  [
    projectEnvironmentDeploymentHref('o', 'p', 'e', 'd'),
    "Deployments rows and the Overview progress card's Open full log",
  ],
  [
    projectEnvironmentStorageHref('o', 'p', 'e'),
    'volume rows on the environment overview (lights Services)',
  ],
  [
    projectComposeSectionHref('o', 'p', 'storage'),
    'no in-page link before or after the one-bar change; the retired /storage path redirects here',
  ],
]

describe('every project route is reachable', () => {
  const reachable = new Map<string, string>()
  for (const id of PROJECT_PAGE_TAB_IDS) {
    reachable.set(routeKey(projectPageTabHref('o', 'p', id)), `project tab ${id}`)
  }
  for (const id of ENVIRONMENT_PAGE_TAB_IDS) {
    reachable.set(routeKey(environmentPageTabHref('o', 'p', 'e', id)), `environment tab ${id}`)
  }
  for (const id of MANAGED_PROJECT_TAB_IDS) {
    reachable.set(routeKey(projectTabHref('o', 'p', id)), `managed project tab ${id}`)
  }
  for (const segment of LEGACY_PROJECT_SEGMENTS) {
    reachable.set(routeKey(`/o/projects/p/${segment}`), `retired path, redirects`)
    reachable.set(routeKey(`/o/projects/p/environments/e/${segment}`), `retired path, redirects`)
  }
  for (const [href, reachedBy] of OFF_BAR_ROUTES) {
    reachable.set(routeKey(href), reachedBy)
  }

  it('links every route file from a tab, a redirect or a named in-page link', () => {
    const unreached = routeKeys().filter((key) => !reachable.has(key))
    expect(unreached).toEqual([])
  })

  it('names only routes that exist', () => {
    const keys = routeKeys()
    for (const [href] of OFF_BAR_ROUTES) {
      expect(keys, href).toContain(routeKey(href))
    }
  })
})
