import { describe, expect, it } from 'vitest'
import {
  formatServerDeleteBlocker,
  parseServerBlockerItems,
  serverBlockerItemName,
  serverBlockerQuotedNames,
} from '@/lib/server-delete-blockers'

describe('server delete blockers', () => {
  it('formats Project / Environment names', () => {
    expect(
      serverBlockerItemName({
        id: 'env-1',
        name: 'staging',
        projectId: 'p1',
        projectName: 'Shop',
        hasDatabase: false,
      })
    ).toBe('Shop / staging')
  })

  it('names up to three environments in the blocker sentence', () => {
    const items = [
      {
        id: 'e1',
        name: 'a',
        projectId: 'p1',
        projectName: 'Acme',
        hasDatabase: false,
      },
      {
        id: 'e2',
        name: 'b',
        projectId: 'p1',
        projectName: 'Acme',
        hasDatabase: true,
      },
      {
        id: 'e3',
        name: 'c',
        projectId: 'p2',
        projectName: 'Beta',
        hasDatabase: false,
      },
    ]
    expect(serverBlockerQuotedNames(items, 0)).toBe('"Acme / a", "Acme / b" and "Beta / c"')
    expect(serverBlockerQuotedNames(items, 2)).toBe('"Acme / a", "Acme / b", "Beta / c" and 2 more')
    expect(
      formatServerDeleteBlocker({
        kind: 'environment',
        count: 5,
        items,
        more: 2,
      })
    ).toBe(
      'App environments "Acme / a", "Acme / b", "Beta / c" and 2 more are still placed on this server.'
    )
    expect(
      formatServerDeleteBlocker({
        kind: 'environment',
        count: 1,
        items: [items[0]],
        more: 0,
      })
    ).toBe('App environment "Acme / a" is still placed on this server.')
  })

  it('names managed and replica databases from items', () => {
    expect(
      formatServerDeleteBlocker({
        kind: 'managed',
        count: 1,
        items: [{ id: 'db-1', name: 'orders' }],
      })
    ).toBe('Managed database "orders" is still placed on this server.')
    expect(
      formatServerDeleteBlocker({
        kind: 'replica',
        count: 2,
        items: [
          { id: 'db-1', name: 'orders' },
          { id: 'db-2', name: 'catalog' },
        ],
      })
    ).toBe('Databases "orders" and "catalog" still have members on this server.')
  })

  it('names project caches from items and counts them without', () => {
    expect(
      formatServerDeleteBlocker({
        kind: 'cache',
        count: 2,
        items: [
          { id: 'c-1', name: 'sessions' },
          { id: 'c-2', name: 'queue' },
        ],
      })
    ).toBe('Remove the caches "sessions" and "queue" on this server first.')
    expect(
      formatServerDeleteBlocker({
        kind: 'cache',
        count: 1,
        items: [{ id: 'c-1', name: 'sessions' }],
      })
    ).toBe('Remove the cache "sessions" on this server first.')
    expect(formatServerDeleteBlocker({ kind: 'cache', count: 1 })).toBe(
      'Remove 1 project cache on this server before deleting it.'
    )
    expect(formatServerDeleteBlocker({ kind: 'cache', count: 3 })).toBe(
      'Remove 3 project caches on this server before deleting it.'
    )
  })

  it('parses environment and database items from wire JSON', () => {
    expect(
      parseServerBlockerItems([
        {
          id: 'env-1',
          name: 'prod',
          projectId: 'p1',
          projectName: 'Shop',
          hasDatabase: false,
        },
        { id: 'db-1', name: 'orders' },
        { bad: true },
      ])
    ).toEqual([
      {
        id: 'env-1',
        name: 'prod',
        projectId: 'p1',
        projectName: 'Shop',
        hasDatabase: false,
      },
      { id: 'db-1', name: 'orders' },
    ])
  })
})
