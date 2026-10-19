import { describe, expect, it } from 'vitest'
import {
  folderActionFor,
  EMPTY_FOLDER_DRAFT,
  folderBodyFields,
  folderLine,
  folderLockExplanation,
  folderNameProblem,
  folderNameKindOf,
  serviceFolderWhere,
  folderStateLabel,
  isDirectoryNamesMode,
  suggestFolderName,
} from '@/lib/directory-names'

describe('suggestFolderName', () => {
  it('makes a readable name from a display name', () => {
    expect(suggestFolderName('  My Uploads! ')).toBe('my-uploads')
    expect(suggestFolderName('example.com')).toBe('example.com')
  })
  it('cuts to 63 and never ends on a separator', () => {
    const out = suggestFolderName(`${'a'.repeat(62)}-b`)
    expect(out.length).toBeLessThanOrEqual(63)
    expect(out.endsWith('-')).toBe(false)
  })
  it('is empty when nothing usable is left', () => {
    expect(suggestFolderName('!!!')).toBe('')
  })
})

describe('folderNameProblem', () => {
  it('accepts empty and valid names', () => {
    expect(folderNameProblem('')).toBeNull()
    expect(folderNameProblem('shop.example.com')).toBeNull()
    expect(folderNameProblem('a')).toBeNull()
  })
  it('refuses capitals, spaces, edge separators and long names', () => {
    expect(folderNameProblem('Shop')).not.toBeNull()
    expect(folderNameProblem('my site')).not.toBeNull()
    expect(folderNameProblem('-a')).not.toBeNull()
    expect(folderNameProblem('a.')).not.toBeNull()
    expect(folderNameProblem('a'.repeat(64))).not.toBeNull()
    expect(folderNameProblem('a..b')).not.toBeNull()
  })
})

describe('folderBodyFields', () => {
  it('sends a typed name in slug mode and nothing for an empty draft', () => {
    expect(folderBodyFields({ ...EMPTY_FOLDER_DRAFT, name: ' data ' }, 'slug')).toEqual({
      slug: 'data',
    })
    expect(folderBodyFields(EMPTY_FOLDER_DRAFT, 'slug')).toEqual({})
  })
  it('never sends a typed name in id mode', () => {
    expect(folderBodyFields({ ...EMPTY_FOLDER_DRAFT, name: 'data' }, 'uuid')).toEqual({})
  })
  it('sends the kind in both mode and the name only for readable names', () => {
    expect(folderBodyFields({ name: 'data', kind: 'slug', common: false }, 'both')).toEqual({
      directoryName: 'slug',
      slug: 'data',
    })
    expect(folderBodyFields({ name: 'data', kind: 'uuid', common: false }, 'both')).toEqual({
      directoryName: 'uuid',
    })
  })
  it('sends common only when on', () => {
    expect(folderBodyFields({ ...EMPTY_FOLDER_DRAFT, common: true }, 'slug')).toEqual({
      common: true,
    })
  })
})

describe('folder wording', () => {
  it('labels states and lines', () => {
    expect(folderStateLabel('removing')).toBe('Being removed')
    expect(
      folderLine({
        id: 'f',
        kind: 'volume',
        state: 'present',
        scope: 'production',
        slug: 'uploads',
        serverId: 's',
        serverName: 'Alpha',
        assetName: 'Uploads',
      })
    ).toBe('Uploads (volume on server Alpha)')
    expect(folderLockExplanation(0)).toBeNull()
    expect(folderLockExplanation(2)).toContain('shared folder')
    expect(serviceFolderWhere('example.com', true)).toBe(
      "example.com, in the site owner's shared folder"
    )
    expect(serviceFolderWhere('example.com', false)).toContain('named after its environment')
    expect(folderNameKindOf('3f2b8c1e-aaaa-4bbb-8ccc-0123456789ab')).toBe('uuid')
    expect(folderNameKindOf('example.com')).toBe('slug')
    expect(folderNameKindOf(null)).toBe('slug')
    expect(isDirectoryNamesMode('both')).toBe(true)
    expect(isDirectoryNamesMode('x')).toBe(false)
  })
})

describe('folderActionFor', () => {
  it('offers remove for an orphan, retry for a stuck removal, forget for a missing folder, and nothing otherwise', () => {
    expect(folderActionFor('orphan')).toBe('remove')
    expect(folderActionFor('removing')).toBe('retry')
    expect(folderActionFor('missing')).toBe('forget')
    expect(folderActionFor('planned')).toBeNull()
    expect(folderActionFor('present')).toBeNull()
  })
})
