import { describe, expect, it } from 'vitest'
import {
  isComposeAutomaticTlsHosting,
  isComposeOwnedHosting,
  readHostingComposeRoute,
  readHostingComposeServiceName,
} from './hosting-compose-owner'

describe('hosting compose provenance', () => {
  const owned = {
    composeOwned: true,
    composeServiceName: 'web',
    composeRoute: 'app.example.com /',
  }

  it('recognizes a compose route that asks for Let\u2019s Encrypt', () => {
    expect(isComposeAutomaticTlsHosting({ ...owned, composeTlsMode: 'automatic' })).toBe(true)
    expect(isComposeAutomaticTlsHosting({ ...owned, composeTlsMode: 'internal' })).toBe(false)
    expect(isComposeAutomaticTlsHosting(owned)).toBe(false)
    expect(isComposeAutomaticTlsHosting({ composeTlsMode: 'automatic' })).toBe(false)
  })

  it('recognizes a row the instance materialized from compose', () => {
    expect(isComposeOwnedHosting(owned)).toBe(true)
    expect(readHostingComposeRoute(owned)).toBe('app.example.com /')
    expect(readHostingComposeServiceName(owned)).toBe('web')
  })

  it('treats a panel row as unowned so its edits still go to /hostings', () => {
    for (const metadata of [null, undefined, {}, { composeServiceName: 'web' }]) {
      expect(isComposeOwnedHosting(metadata)).toBe(false)
      expect(readHostingComposeRoute(metadata)).toBeNull()
      expect(readHostingComposeServiceName(metadata)).toBeNull()
    }
  })

  it('reports no route when the marker is present but the route is not', () => {
    expect(readHostingComposeRoute({ composeOwned: true })).toBeNull()
    expect(readHostingComposeRoute({ composeOwned: true, composeRoute: 3 })).toBeNull()
  })
})
