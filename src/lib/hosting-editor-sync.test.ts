import { describe, expect, it } from 'vitest'
import { sameEditorValue, syncEditors } from './hosting-editor-sync'

type Editor = { hostnames: string; tls: string | null }

const row = (editorKey: string, hostnames: string, tls: string | null = null) => ({
  editorKey,
  seed: { hostnames, tls } as Editor,
})

describe('syncEditors', () => {
  it('fills a missing editor from its row', () => {
    const next = syncEditors<Editor>({}, {}, [row('a', 'x.dev')], sameEditorValue)
    expect(next.editors).toEqual({ a: { hostnames: 'x.dev', tls: null } })
    expect(next.baseline).toEqual({ a: { hostnames: 'x.dev', tls: null } })
  })

  it('refills an editor without edits when the server answers anew', () => {
    const old = { hostnames: 'x.dev', tls: null }
    const next = syncEditors<Editor>(
      { a: old },
      { a: old },
      [row('a', 'x.dev', 'le')],
      sameEditorValue
    )
    expect(next.editors.a).toEqual({ hostnames: 'x.dev', tls: 'le' })
    expect(next.baseline.a).toEqual({ hostnames: 'x.dev', tls: 'le' })
  })

  it('keeps unsaved edits', () => {
    const editors = { a: { hostnames: 'typed.dev', tls: null } }
    const baseline = { a: { hostnames: '', tls: null } }
    const next = syncEditors<Editor>(editors, baseline, [row('a', '')], sameEditorValue)
    expect(next.editors).toBe(editors)
    expect(next.baseline).toEqual(baseline)
  })

  it('shows the saved state after a save, not the rows from before it', () => {
    // The save marked what was saved as the baseline; the refetch brings it back.
    const saved = { hostnames: 'new.dev', tls: null }
    const next = syncEditors<Editor>(
      { a: saved },
      { a: saved },
      [row('a', 'new.dev', 'le')],
      sameEditorValue
    )
    expect(next.editors.a).toEqual({ hostnames: 'new.dev', tls: 'le' })
  })

  it('returns the same editors object when nothing changed, so an effect cannot loop', () => {
    const editors = { a: { hostnames: 'x.dev', tls: null } }
    const next = syncEditors<Editor>(editors, editors, [row('a', 'x.dev')], sameEditorValue)
    expect(next.editors).toBe(editors)
  })

  it('treats an editor with no baseline as edited', () => {
    const editors = { a: { hostnames: 'typed.dev', tls: null } }
    const next = syncEditors<Editor>(editors, {}, [row('a', '')], sameEditorValue)
    expect(next.editors).toBe(editors)
  })
})

describe('sameEditorValue', () => {
  it('compares plain fields', () => {
    expect(sameEditorValue({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBe(true)
    expect(sameEditorValue({ a: 1, b: 'x' }, { a: 1, b: 'y' })).toBe(false)
    expect(sameEditorValue<Record<string, number>>({ a: 1 }, { a: 1, b: 2 })).toBe(false)
  })
})
