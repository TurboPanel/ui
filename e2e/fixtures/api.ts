import type { Page, Route } from '@playwright/test'

// A fake control plane for the smoke test. The export calls `/api/...` on its
// own origin, so `page.route` answers every call in the browser and nothing
// leaves the machine. Only the reads the screens under test make are
// answered; any other call gets a 404 and is listed in `unmocked`, so a new
// request shows up in the test output instead of failing silently.

export const ORG_ID = 'org_smoke'
export const PROJECT_ID = 'proj_smoke'
export const ENVIRONMENT_ID = 'env_smoke'
export const WORKSPACE_ID = 'ws_smoke'

const NOW = '2026-10-01T00:00:00.000Z'
const API = '/api/client/v1'

const organization = { id: ORG_ID, name: 'Smoke Org', createdAt: NOW }

const project = {
  id: PROJECT_ID,
  name: 'Smoke Project',
  description: null,
  workspaceId: WORKSPACE_ID,
  repositoryId: null,
  metadata: { type: 'docker-compose' },
  options: {
    compose: {
      version: 1,
      data: { services: { web: { image: 'nginx:alpine' } } },
      presentation: {},
    },
  },
  createdAt: NOW,
  updatedAt: NOW,
}

const environment = {
  id: ENVIRONMENT_ID,
  name: 'production',
  description: null,
  projectId: PROJECT_ID,
  serverId: null,
  metadata: null,
  options: null,
  createdAt: NOW,
  updatedAt: NOW,
}

const workspace = {
  id: WORKSPACE_ID,
  name: 'Smoke Workspace',
  description: null,
  organizationId: ORG_ID,
  kind: 'user',
  createdAt: NOW,
  updatedAt: NOW,
}

export type ApiMock = {
  /** `METHOD /path` of every `/api` call nothing answered. */
  unmocked: string[]
}

function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

/** Answers one GET by path; null means "not mocked". */
function readBody(path: string): unknown {
  switch (path) {
    case `${API}/status`:
      return { ok: true, runtime: 'deno', isSignupEnabled: false, authProviders: [] }
    case `${API}/organizations`:
      return { ok: true, organizations: [organization] }
    case `${API}/workspaces`:
      return { ok: true, workspaces: [workspace] }
    case `${API}/projects`:
      return { ok: true, projects: [project] }
    case `${API}/projects/${PROJECT_ID}`:
      return { ok: true, project }
    case `${API}/environments`:
      return { ok: true, environments: [environment] }
    case `${API}/environments/${ENVIRONMENT_ID}`:
      return { ok: true, environment, needsRedeploy: [] }
    case `${API}/environments/${ENVIRONMENT_ID}/config-view`:
      return {
        ok: true,
        environmentId: ENVIRONMENT_ID,
        projectId: PROJECT_ID,
        followsBase: true,
        base: { services: [], variables: [], linuxUsers: [] },
        effective: { services: [], variables: [], linuxUsers: [] },
        changes: [],
      }
    case `${API}/environments/${ENVIRONMENT_ID}/deployments`:
      return { ok: true, deployments: [], nextCursor: null }
    case `${API}/notifications/unread-count`:
      return { ok: true, unread: 0 }
    case `${API}/access/resource-id`:
      return { ok: true, resourceId: 'res_smoke', kind: 'project', itemId: PROJECT_ID }
    case `${API}/containers`:
      return { ok: true, containers: [] }
    case `${API}/servers`:
      return { ok: true, servers: [] }
    case `${API}/environments/${ENVIRONMENT_ID}/releases`:
      return { ok: true, releases: [] }
    case `${API}/access/check`:
      return { ok: true, allowed: true }
    case `${API}/bindings`:
      return { ok: true, bindings: [] }
    case `${API}/storage`:
      return { ok: true, storage: [] }
    case `${API}/variables`:
      return { ok: true, variables: [] }
    case `${API}/services`:
      return { ok: true, services: [] }
    case `${API}/tls`:
      return { ok: true, tls: [] }
    case `${API}/repositories`:
      return { ok: true, repositories: [] }
    case `${API}/projects/${PROJECT_ID}/principals`:
      return { ok: true, principals: [] }
    case '/api/health':
      return { ok: true, version: '0.0.0-smoke' }
    default:
      return null
  }
}

/**
 * Installs the mock on a page. Signed out until the sign-in form posts, then
 * signed in for the rest of the test.
 */
export async function mockApi(page: Page): Promise<ApiMock> {
  const mock: ApiMock = { unmocked: [] }
  let signedIn = false

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const { pathname } = new URL(request.url())
    const method = request.method()

    if (method === 'GET' && pathname === `${API}/authn/session`) {
      if (!signedIn) return json(route, { ok: false }, 401)
      return json(route, {
        ok: true,
        userId: 'user_smoke',
        email: 'owner@example.test',
        role: 'user',
      })
    }
    if (method === 'POST' && pathname === `${API}/auth/sign-in`) {
      signedIn = true
      return json(route, {
        ok: true,
        userId: 'user_smoke',
        email: 'owner@example.test',
        role: 'user',
      })
    }
    if (method === 'GET') {
      const body = readBody(pathname)
      if (body !== null) return json(route, body)
    }

    mock.unmocked.push(`${method} ${pathname}`)
    return json(route, { error: 'not_mocked' }, 404)
  })

  return mock
}
