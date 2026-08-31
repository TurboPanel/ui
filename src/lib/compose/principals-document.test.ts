import { describe, expect, it } from 'vitest'
import type { ComposeDocument } from '@/lib/compose'
import {
  composePrincipalAliases,
  nextPrincipalAlias,
  readComposePrincipals,
  writeComposePrincipals,
} from '@/lib/compose/principals-document'

function documentWith(root?: Record<string, unknown>): ComposeDocument {
  return {
    version: 1,
    data: { services: {}, ...(root ? { 'x-turbopanel': root } : {}) },
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
