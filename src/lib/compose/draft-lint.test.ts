import { describe, expect, it } from 'vitest'
import { composeDocumentToYaml, yamlToComposeDocument } from './convert'
import { draftFromYaml, lintEnvironmentLayer } from './layer-lint'
import { blockingComposeLintIssues } from './lint'

const BASE = yamlToComposeDocument(`services:
  vpn:
    build:
      context: ./vpn
`)

describe('environment YAML tab lint', () => {
  it('merges the typed text, not the draft from before the edit', () => {
    const staleDraft = yamlToComposeDocument('services:\n  vpn:\n    environment:\n      A: b\n')
    const typed =
      'services:\n  vpn:\n    environment:\n      A: b\n  worker:\n    restart: always\n'
    const layer = draftFromYaml(typed, staleDraft) ?? staleDraft
    const issues = blockingComposeLintIssues(
      lintEnvironmentLayer(typed, layer, { before: [BASE], after: [] })
    )
    expect(issues.map((i) => i.path)).toEqual(['services.worker'])
  })

  it('clears the error once the typed text names an image', () => {
    const staleDraft = yamlToComposeDocument('services:\n  worker:\n    restart: always\n')
    const typed = 'services:\n  worker:\n    image: busybox\n'
    const layer = draftFromYaml(typed, staleDraft) ?? staleDraft
    expect(composeDocumentToYaml(layer)).toContain('busybox')
    expect(
      blockingComposeLintIssues(lintEnvironmentLayer(typed, layer, { before: [BASE], after: [] }))
    ).toEqual([])
  })
})
