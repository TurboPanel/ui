import { describe, expect, it } from 'vitest'
import type { ComposeDocument } from '@/lib/compose'
import {
  principalRequiredServiceNames,
  unownedPrincipalRequiredServices,
} from '@/lib/compose/principal-required'
import { patchServiceTurbopanelExtension } from '@/lib/compose/service-kind'

function documentWith(
  services: Record<string, Record<string, unknown>>,
): ComposeDocument {
  return {
    version: 1,
    data: { services },
    presentation: { keyOrder: ['services'], comments: {} },
  }
}

const nodeApp = patchServiceTurbopanelExtension(
  {},
  { serviceKind: 'node', source: { sourceId: '11111111-1111-4111-8111-111111111111' } },
)
const gitSite = patchServiceTurbopanelExtension(
  {},
  { serviceKind: 'site', engine: 'caddy', source: { sourceId: '22222222-2222-4222-8222-222222222222' } },
)
const uploadedSite = patchServiceTurbopanelExtension(
  {},
  {
    serviceKind: 'site',
    engine: 'caddy',
    root: 'public',
    sourceKind: 'managed-directory',
  },
)
const nativeSourceContainer = patchServiceTurbopanelExtension(
  { image: 'node:24' },
  { source: { sourceId: '33333333-3333-4333-8333-333333333333' } },
)
const railpackContainer = patchServiceTurbopanelExtension(
  { image: 'node:24' },
  { source: { sourceId: '44444444-4444-4444-8444-444444444444', buildKind: 'railpack' } },
)
const plainContainer = { image: 'nginx' }

describe('principalRequiredServiceNames', () => {
  it('finds native-release sources and uploaded-directory sites', () => {
    const document = documentWith({
      app: nodeApp,
      site: gitSite,
      blog: uploadedSite,
      api: nativeSourceContainer,
      worker: railpackContainer,
      db: plainContainer,
    })
    // Railpack publishes an image, not a tree — no principal needed.
    expect(principalRequiredServiceNames(document)).toEqual([
      'api',
      'app',
      'blog',
      'site',
    ])
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
      }),
    ).toEqual([])
    expect(
      principalRequiredServiceNames({
        version: 1,
        data: { services: { broken: 'not-a-map', app: nodeApp } },
        presentation: { keyOrder: [], comments: {} },
      }),
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
      }),
    ).toEqual(['app'])
  })

  it('reports a service nobody stewards', () => {
    expect(
      unownedPrincipalRequiredServices({
        document: documentWith({ app: nodeApp }),
        services: [{ id: 'svc-1', composeServiceName: 'app' }],
        principals: [{ serviceIds: ['svc-other'] }],
      }),
    ).toEqual(['app'])
  })

  it('stays quiet once a principal stewards the service', () => {
    expect(
      unownedPrincipalRequiredServices({
        document: documentWith({ app: nodeApp }),
        services: [{ id: 'svc-1', composeServiceName: 'app' }],
        principals: [{ serviceIds: ['svc-1'] }],
      }),
    ).toEqual([])
  })

  it('never reports railpack or plain container services', () => {
    expect(
      unownedPrincipalRequiredServices({
        document: documentWith({ worker: railpackContainer, db: plainContainer }),
        services: [],
        principals: [],
      }),
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
      }),
    ).toEqual(['site'])
  })
})
