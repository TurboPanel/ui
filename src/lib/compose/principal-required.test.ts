import { describe, expect, it } from 'vitest'
import type { ComposeDocument } from '@/lib/compose'
import {
  attachSoleAccountToNewApps,
  declareAccountAndAttach,
  knownAccountNames,
  planAccountDeclaration,
  principalRequiredServiceNames,
  unownedPrincipalRequiredServices,
} from '@/lib/compose/principal-required'
import { readComposePrincipals, writeComposePrincipals } from '@/lib/compose/principals-document'
import {
  patchServiceTurbopanelExtension,
  readServiceTurbopanelExtension,
} from '@/lib/compose/service-kind'

function documentWith(services: Record<string, Record<string, unknown>>): ComposeDocument {
  return {
    version: 1,
    data: { services },
    presentation: { keyOrder: ['services'], comments: {} },
  }
}

const nodeApp = patchServiceTurbopanelExtension(
  {},
  { serviceKind: 'node', source: { sourceId: '11111111-1111-4111-8111-111111111111' } }
)
const gitSite = patchServiceTurbopanelExtension(
  {},
  {
    serviceKind: 'site',
    engine: 'caddy',
    source: { sourceId: '22222222-2222-4222-8222-222222222222' },
  }
)
const uploadedSite = patchServiceTurbopanelExtension(
  {},
  {
    serviceKind: 'site',
    engine: 'caddy',
    root: 'public',
    sourceKind: 'managed-directory',
  }
)
const nativeSourceContainer = patchServiceTurbopanelExtension(
  { image: 'node:24' },
  { source: { sourceId: '33333333-3333-4333-8333-333333333333' } }
)
const imageContainer = patchServiceTurbopanelExtension(
  { image: 'node:24' },
  { source: { sourceId: '44444444-4444-4444-8444-444444444444', buildKind: 'image' } }
)
const plainContainer = { image: 'nginx' }

describe('principalRequiredServiceNames', () => {
  it('finds native-release sources and uploaded-directory sites', () => {
    const document = documentWith({
      app: nodeApp,
      site: gitSite,
      blog: uploadedSite,
      api: nativeSourceContainer,
      worker: imageContainer,
      db: plainContainer,
    })
    // An image build publishes an image, not a tree — no principal needed.
    expect(principalRequiredServiceNames(document)).toEqual(['api', 'app', 'blog', 'site'])
  })

  it('returns nothing for an absent or empty document', () => {
    expect(principalRequiredServiceNames(null)).toEqual([])
    expect(principalRequiredServiceNames(undefined)).toEqual([])
    expect(principalRequiredServiceNames(documentWith({}))).toEqual([])
    expect(
      principalRequiredServiceNames({
        version: 1,
        data: { services: 'not-a-map' },
        presentation: { keyOrder: [], comments: {} },
      })
    ).toEqual([])
    expect(
      principalRequiredServiceNames({
        version: 1,
        data: { services: { broken: 'not-a-map', app: nodeApp } },
        presentation: { keyOrder: [], comments: {} },
      })
    ).toEqual(['app'])
  })
})

describe('unownedPrincipalRequiredServices', () => {
  it('reports a source service with no service row yet', () => {
    // The common case, not an edge one: service rows are written only at
    // deploy-prepare, so before the first deploy every source-backed service
    // is unowned — exactly when the daemon would silently skip its release.
    expect(
      unownedPrincipalRequiredServices({
        document: documentWith({ app: nodeApp }),
        services: [],
        principals: [],
      })
    ).toEqual(['app'])
  })

  it('reports a service nobody stewards', () => {
    expect(
      unownedPrincipalRequiredServices({
        document: documentWith({ app: nodeApp }),
        services: [{ id: 'svc-1', composeServiceName: 'app' }],
        principals: [{ serviceIds: ['svc-other'] }],
      })
    ).toEqual(['app'])
  })

  it('stays quiet once a principal stewards the service', () => {
    expect(
      unownedPrincipalRequiredServices({
        document: documentWith({ app: nodeApp }),
        services: [{ id: 'svc-1', composeServiceName: 'app' }],
        principals: [{ serviceIds: ['svc-1'] }],
      })
    ).toEqual([])
  })

  it('never reports image-built or plain container services', () => {
    expect(
      unownedPrincipalRequiredServices({
        document: documentWith({ worker: imageContainer, db: plainContainer }),
        services: [],
        principals: [],
      })
    ).toEqual([])
  })

  it('reports only the unowned half of a mixed project', () => {
    expect(
      unownedPrincipalRequiredServices({
        document: documentWith({ app: nodeApp, site: gitSite }),
        services: [
          { id: 'svc-1', composeServiceName: 'app' },
          { id: 'svc-2', composeServiceName: 'site' },
        ],
        principals: [{ serviceIds: ['svc-1'] }],
      })
    ).toEqual(['site'])
  })
})

describe('declared aliases settle ownership without a query', () => {
  const aliased = patchServiceTurbopanelExtension(
    {},
    {
      serviceKind: 'node',
      principal: 'app',
      source: { sourceId: '11111111-1111-4111-8111-111111111111' },
    }
  )

  function withPrincipals(
    services: Record<string, Record<string, unknown>>,
    principals: Record<string, Record<string, unknown>>
  ): ComposeDocument {
    return {
      version: 1,
      data: { services, 'x-turbopanel': { principals } },
      presentation: { keyOrder: ['services'], comments: {} },
    }
  }

  it('counts a resolving alias as owned with no service rows at all', () => {
    // The common case before the first deploy: there are no service rows yet,
    // so the steward check has nothing to look at — but the operator has
    // already written down which account the app runs as.
    expect(
      unownedPrincipalRequiredServices({
        document: withPrincipals({ api: aliased }, { app: {} }),
        services: [],
        principals: [],
      })
    ).toEqual([])
  })

  it('still reports an alias the root does not declare', () => {
    // A dangling alias names an account that does not exist, which is the same
    // standing as naming none.
    expect(
      unownedPrincipalRequiredServices({
        document: withPrincipals({ api: aliased }, { other: {} }),
        services: [],
        principals: [],
      })
    ).toEqual(['api'])
  })

  it('keeps the steward fallback for a document that declares no alias', () => {
    expect(
      unownedPrincipalRequiredServices({
        document: documentWith({ api: nodeApp }),
        services: [{ id: 'svc-1', composeServiceName: 'api' }],
        principals: [{ serviceIds: ['svc-1'] }],
      })
    ).toEqual([])
  })
})

function servicesOf(document: ComposeDocument): Record<string, Record<string, unknown>> {
  return document.data.services as Record<string, Record<string, unknown>>
}

describe('declareAccountAndAttach', () => {
  it('declares the account and attaches waiting apps when it is the only one', () => {
    const next = declareAccountAndAttach(documentWith({ app: nodeApp }), 'shop', ['app'], true)
    expect(Object.keys(readComposePrincipals(next))).toEqual(['shop'])
    expect(readServiceTurbopanelExtension(servicesOf(next).app)?.principal).toBe('shop')
    expect(
      unownedPrincipalRequiredServices({ document: next, services: [], principals: [] })
    ).toEqual([])
  })

  it('declares without attaching when the choice is ambiguous', () => {
    const next = declareAccountAndAttach(documentWith({ app: nodeApp }), 'shop', ['app'], false)
    expect(Object.keys(readComposePrincipals(next))).toEqual(['shop'])
    expect(readServiceTurbopanelExtension(servicesOf(next).app)?.principal).toBeUndefined()
  })

  it('keeps an app that already names an account', () => {
    const owned = patchServiceTurbopanelExtension(nodeApp, { principal: 'other' })
    const next = declareAccountAndAttach(documentWith({ app: owned }), 'shop', ['app'], true)
    expect(readServiceTurbopanelExtension(servicesOf(next).app)?.principal).toBe('other')
  })
})

describe('planAccountDeclaration', () => {
  const empty = documentWith({})
  it('writes the account into the environment that holds the waiting app', () => {
    const plan = planAccountDeclaration({
      username: 'My Shop',
      base: empty,
      environments: [{ id: 'env1', document: documentWith({ app: nodeApp }), services: [] }],
      principals: [],
    })
    expect(plan?.alias).toBe('myshop')
    expect(plan?.writes).toHaveLength(1)
    expect(plan?.writes[0].target).toEqual({ kind: 'environment', environmentId: 'env1' })
    expect(
      readServiceTurbopanelExtension(servicesOf(plan!.writes[0].document).app)?.principal
    ).toBe('myshop')
  })

  it('returns null when no app is waiting', () => {
    expect(
      planAccountDeclaration({
        username: 'x',
        base: documentWith({ web: plainContainer }),
        environments: [],
        principals: [],
      })
    ).toBeNull()
  })

  it('does not attach when another account is already declared', () => {
    const base = writeComposePrincipals(empty, { first: {} })
    const plan = planAccountDeclaration({
      username: 'second',
      base,
      environments: [{ id: 'env1', document: documentWith({ app: nodeApp }), services: [] }],
      principals: [],
    })
    expect(
      readServiceTurbopanelExtension(servicesOf(plan!.writes[0].document).app)?.principal
    ).toBeUndefined()
  })
})

describe('attachSoleAccountToNewApps', () => {
  const one = writeComposePrincipals(documentWith({ web: plainContainer }), { shop: {} })
  it('gives the only account to an app the edit just made native', () => {
    const after = { ...one, data: { ...one.data, services: { web: plainContainer, app: nodeApp } } }
    const next = attachSoleAccountToNewApps(one, after)
    expect(readServiceTurbopanelExtension(servicesOf(next).app)?.principal).toBe('shop')
  })

  it('leaves apps that were already waiting alone', () => {
    const before = { ...one, data: { ...one.data, services: { app: nodeApp } } }
    expect(attachSoleAccountToNewApps(before, before)).toBe(before)
  })

  it('does nothing with two accounts', () => {
    const two = writeComposePrincipals(one, { shop: {}, blog: {} })
    const after = { ...two, data: { ...two.data, services: { app: nodeApp } } }
    expect(attachSoleAccountToNewApps(two, after)).toBe(after)
  })
})

describe('accounts made by hand on Bindings', () => {
  const manual = (username: string) => ({ username, serviceIds: [] as string[], metadata: {} })
  const waiting = [{ id: 'env1', document: documentWith({ app: nodeApp }), services: [] }]
  const appOf = (plan: ReturnType<typeof planAccountDeclaration>) =>
    readServiceTurbopanelExtension(servicesOf(plan!.writes[0].document).app)?.principal

  it('counts a hand-made row, and a row that came from an alias, once', () => {
    const base = writeComposePrincipals(documentWith({}), { shop: {} })
    const names = knownAccountNames(
      [base],
      [manual('Site'), { username: 'shop_x1', metadata: { composeAlias: 'shop' } }]
    )
    expect([...names].sort()).toEqual(['shop', 'site'])
  })

  it('does not call a new account the only one when a hand-made account exists', () => {
    const plan = planAccountDeclaration({
      username: 'second',
      base: documentWith({}),
      environments: waiting,
      principals: [manual('site')],
    })
    expect(Object.keys(readComposePrincipals(plan!.writes[0].document))).toEqual(['second'])
    expect(appOf(plan)).toBeUndefined()
  })

  it('adopts the single hand-made account: same name, declared and attached', () => {
    const plan = planAccountDeclaration({
      username: 'site',
      base: documentWith({}),
      environments: waiting,
      principals: [manual('site')],
    })
    expect(plan?.alias).toBe('site')
    expect(appOf(plan)).toBe('site')
  })

  it('does not attach a typed name that matches one of several accounts', () => {
    const plan = planAccountDeclaration({
      username: 'site',
      base: documentWith({}),
      environments: waiting,
      principals: [manual('site'), manual('other')],
    })
    expect(plan?.alias).toBe('site')
    expect(appOf(plan)).toBeUndefined()
  })

  it('attaches nothing to a new app when another document or row holds a second account', () => {
    const one = writeComposePrincipals(documentWith({ web: plainContainer }), { shop: {} })
    const after = { ...one, data: { ...one.data, services: { web: plainContainer, app: nodeApp } } }
    expect(attachSoleAccountToNewApps(one, after, new Set(['shop', 'site']))).toBe(after)
    expect(attachSoleAccountToNewApps(one, after, new Set(['shop']))).not.toBe(after)
  })
})
