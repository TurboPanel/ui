import { describe, expect, it } from 'vitest'
import type { ComposeDocument } from '@/lib/compose'
import {
  composePrincipalAliases,
  nextPrincipalAlias,
  readComposePrincipals,
  renameComposePrincipal,
  writeComposePrincipals,
} from '@/lib/compose/principals-document'

function documentWith(
  root?: Record<string, unknown>,
  services: Record<string, unknown> = {},
): ComposeDocument {
  return {
    version: 1,
    data: { services, ...(root ? { 'x-turbopanel': root } : {}) },
    presentation: { keyOrder: ['services'], comments: {} },
  }
}

describe('readComposePrincipals', () => {
  it('reads declared aliases in document order', () => {
    const document = documentWith({
      principals: { web: { access: 'sftp' }, worker: {} },
    })
    expect(composePrincipalAliases(document)).toEqual(['web', 'worker'])
    expect(readComposePrincipals(document).web).toEqual({ access: 'sftp' })
  })

  it('is empty for a document with no root block', () => {
    expect(composePrincipalAliases(documentWith())).toEqual([])
    expect(composePrincipalAliases(null)).toEqual([])
  })
})

describe('writeComposePrincipals', () => {
  it('adds the block without touching the rest of the document', () => {
    const next = writeComposePrincipals(documentWith(), { app: {} })
    expect(next.data['x-turbopanel']).toEqual({ principals: { app: {} } })
    expect(next.data.services).toEqual({})
  })

  it('removes an emptied block rather than leaving a bare root key', () => {
    // `x-turbopanel: {}` is noise in the YAML and the linter would have to
    // explain it.
    const next = writeComposePrincipals(
      documentWith({ principals: { app: {} } }),
      {},
    )
    expect('x-turbopanel' in next.data).toBe(false)
  })
})

describe('renameComposePrincipal', () => {
  it('renames the declaration and every service that references it', () => {
    const document = documentWith(
      { principals: { web: { access: 'sftp' }, worker: {} } },
      {
        blog: { 'x-turbopanel': { serviceKind: 'site', principal: 'web' } },
        jobs: { 'x-turbopanel': { serviceKind: 'node', principal: 'worker' } },
      },
    )
    const next = renameComposePrincipal(document, 'web', 'storefront')
    expect(readComposePrincipals(next)).toEqual({
      storefront: { access: 'sftp' },
      worker: {},
    })
    const services = next.data.services as Record<
      string,
      { 'x-turbopanel': Record<string, unknown> }
    >
    expect(services.blog!['x-turbopanel'].principal).toBe('storefront')
    // A service naming a different account is left alone.
    expect(services.jobs!['x-turbopanel'].principal).toBe('worker')
  })

  it('preserves declaration order — a rename is not a move', () => {
    const document = documentWith({ principals: { web: {}, worker: {} } })
    expect(
      composePrincipalAliases(renameComposePrincipal(document, 'web', 'blog')),
    ).toEqual(['blog', 'worker'])
  })

  it('returns the document unchanged on an unknown, invalid, or taken name', () => {
    const document = documentWith(
      { principals: { web: {}, worker: {} } },
      { blog: { 'x-turbopanel': { principal: 'web' } } },
    )
    expect(renameComposePrincipal(document, 'ghost', 'blog')).toBe(document)
    expect(renameComposePrincipal(document, 'web', '9lives')).toBe(document)
    expect(renameComposePrincipal(document, 'web', 'worker')).toBe(document)
    expect(renameComposePrincipal(document, 'web', 'web')).toBe(document)
  })

  it('does not invent an extension on a service that has none', () => {
    const document = documentWith(
      { principals: { web: {} } },
      { plain: { image: 'nginx' } },
    )
    const next = renameComposePrincipal(document, 'web', 'blog')
    expect(next.data.services).toEqual({ plain: { image: 'nginx' } })
  })
})

describe('nextPrincipalAlias', () => {
  it('uses the seed when it is free and valid', () => {
    expect(nextPrincipalAlias([], 'web')).toBe('web')
  })

  it('suffixes rather than colliding', () => {
    expect(nextPrincipalAlias(['web', 'web-2'], 'web')).toBe('web-3')
  })

  it('falls back when the seed folds to nothing usable', () => {
    expect(nextPrincipalAlias([], '!!!')).toBe('app')
    expect(nextPrincipalAlias([], '9lives')).toBe('app')
  })
})
