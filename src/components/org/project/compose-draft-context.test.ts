import { describe, expect, it } from 'vitest'
import {
  composeFullYaml,
  isComposeDraftDirty,
  reconcileComposeDraft,
  seedComposeDraftFromDocument,
} from '@/components/org/project/compose-draft-context'
import {
  composeDocumentToYaml,
  emptyComposeDocument,
  yamlToComposeDocument,
} from '@/lib/compose'

describe('compose draft session helpers', () => {
  it('seeds a clean snapshot from a saved document', () => {
    const doc = yamlToComposeDocument(`
services:
  web:
    image: nginx:alpine
`)
    const snap = seedComposeDraftFromDocument(doc)
    expect(isComposeDraftDirty(snap)).toBe(false)
    expect(reconcileComposeDraft(snap)?.data.services).toEqual(doc.data.services)
  })

  it('marks yaml-only edits dirty even before draft flush', () => {
    const snap = seedComposeDraftFromDocument(emptyComposeDocument())
    const dirty = {
      ...snap,
      yaml: composeDocumentToYaml(
        yamlToComposeDocument(`
services:
  api:
    image: redis:7
`),
      ),
    }
    expect(isComposeDraftDirty(dirty)).toBe(true)
    const reconciled = reconcileComposeDraft(dirty)
    expect(reconciled).not.toBeNull()
    expect(
      composeFullYaml(reconciled!).includes('redis:7'),
    ).toBe(true)
  })

  it('returns null when YAML is unparseable', () => {
    const snap = seedComposeDraftFromDocument(emptyComposeDocument())
    expect(
      reconcileComposeDraft({
        ...snap,
        yaml: 'services: [',
      }),
    ).toBeNull()
  })
})
