import { describe, expect, it } from 'vitest'
import type { ComposeDocument } from '@/lib/compose'
import {
  managedDirectorySiteNames,
  unownedManagedDirectorySites,
} from '@/lib/compose/managed-directory-sites'
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

const uploadedSite = patchServiceTurbopanelExtension(
  {},
  { serviceKind: 'site', engine: 'caddy', root: 'public', sourceKind: 'managed-directory' },
)
const releaseSite = patchServiceTurbopanelExtension(
  {},
  { serviceKind: 'site', engine: 'caddy', root: 'public' },
)
const container = { image: 'nginx' }

describe('managedDirectorySiteNames', () => {
  it('finds only uploaded-directory sites', () => {
    const document = documentWith({ blog: uploadedSite, app: releaseSite, db: container })
    expect(managedDirectorySiteNames(document)).toEqual(['blog'])
  })

  it('returns nothing for an absent or empty document', () => {
    expect(managedDirectorySiteNames(null)).toEqual([])
    expect(managedDirectorySiteNames(undefined)).toEqual([])
    expect(managedDirectorySiteNames(documentWith({}))).toEqual([])
    expect(
      managedDirectorySiteNames({
        version: 1,
        data: { services: 'not-a-map' },
        presentation: { keyOrder: [], comments: {} },
      }),
    ).toEqual([])
    expect(
      managedDirectorySiteNames({
        version: 1,
        data: { services: { broken: 'not-a-map', site: uploadedSite } },
        presentation: { keyOrder: [], comments: {} },
      }),
    ).toEqual(['site'])
  })

  it('sorts so the notice reads the same across renders', () => {
    const document = documentWith({ zeta: uploadedSite, alpha: uploadedSite })
    expect(managedDirectorySiteNames(document)).toEqual(['alpha', 'zeta'])
  })
})

describe('unownedManagedDirectorySites', () => {
  it('reports a site with no service row yet', () => {
    // The common case, not an edge one: service rows are written only at
    // deploy-prepare, so a freshly created Hosting project is always here — and
    // that is exactly when saying so is useful.
    expect(
      unownedManagedDirectorySites({
        document: documentWith({ blog: uploadedSite }),
        services: [],
        principals: [],
      }),
    ).toEqual(['blog'])
  })

  it('reports a site whose service nobody stewards', () => {
    expect(
      unownedManagedDirectorySites({
        document: documentWith({ blog: uploadedSite }),
        services: [{ id: 'svc-1', composeServiceName: 'blog' }],
        principals: [{ serviceIds: ['svc-other'] }],
      }),
    ).toEqual(['blog'])
  })

  it('stays quiet once a principal stewards the service', () => {
    expect(
      unownedManagedDirectorySites({
        document: documentWith({ blog: uploadedSite }),
        services: [{ id: 'svc-1', composeServiceName: 'blog' }],
        principals: [{ serviceIds: ['svc-1'] }],
      }),
    ).toEqual([])
  })

  it('never reports a release-backed site', () => {
    // A release tree is published by the daemon and owned by the release
    // engine; it needs no account to upload as.
    expect(
      unownedManagedDirectorySites({
        document: documentWith({ app: releaseSite }),
        services: [],
        principals: [],
      }),
    ).toEqual([])
  })

  it('reports only the unowned half of a mixed project', () => {
    expect(
      unownedManagedDirectorySites({
        document: documentWith({ blog: uploadedSite, shop: uploadedSite }),
        services: [
          { id: 'svc-1', composeServiceName: 'blog' },
          { id: 'svc-2', composeServiceName: 'shop' },
        ],
        principals: [{ serviceIds: ['svc-1'] }],
      }),
    ).toEqual(['shop'])
  })
})
