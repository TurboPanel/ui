import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

function read(file: string): string {
  return readFileSync(path.join(ROOT, file), 'utf8')
}

describe('promote.yml', () => {
  it('is labelled break-glass and only runs when dispatched by hand', () => {
    const workflow = read('.github/workflows/promote.yml')
    expect(workflow.startsWith('# BREAK-GLASS promotion')).toBe(true)
    const triggers = /^on:\n((?: {2}.*\n|\n)+)/m.exec(workflow)?.[1] ?? ''
    const events = [...triggers.matchAll(/^ {2}([a-z_]+):/gm)].map((match) => match[1])
    expect(events).toEqual(['workflow_dispatch'])
  })

  it('leaves the automatic release workflows in place and AGENTS.md calls the form break-glass', () => {
    for (const file of ['promote-prs.yml', 'publish-rc.yml', 'publish-release.yml']) {
      expect(read(`.github/workflows/${file}`).length, file).toBeGreaterThan(0)
    }
    expect(read('AGENTS.md').toLowerCase()).toContain('break-glass')
  })
})
