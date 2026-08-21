import { describe, expect, it } from 'vitest'
import { parseComposeDraft } from '@/components/org/project-create/compose-draft'
import { isBlankComposeData } from '@/lib/compose'

describe('parseComposeDraft', () => {
  it('treats a blank draft as an empty compose document', () => {
    const result = parseComposeDraft('   \n  ')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(isBlankComposeData(result.document.data)).toBe(true)
  })

  it('parses a real compose file', () => {
    const result = parseComposeDraft('services:\n  web:\n    image: nginx\n')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.document.data).toHaveProperty('services')
  })

  it('reports a message instead of throwing on broken YAML', () => {
    const result = parseComposeDraft('services:\n  web:\n   - image: nginx\n  bad: [')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.length).toBeGreaterThan(0)
  })
})
