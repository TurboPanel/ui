import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

function read(file: string): string {
  return readFileSync(path.join(ROOT, file), 'utf8')
}

/** Every TurboPanel/dev reusable workflow and the signer in the three promotion workflows. */
function promotionPins(): { dev: string[]; signer: string[] } {
  const files = ['promote.yml', 'publish-rc.yml', 'publish-release.yml']
  const text = files.map((file) => read(`.github/workflows/${file}`)).join('\n')
  const dev = [
    ...text.matchAll(
      /TurboPanel\/dev\/\.github\/(?:workflows|actions)\/[\w-]+(?:\.yml)?@([0-9a-f]{40})/g
    ),
  ].map((match) => match[1])
  const devRef = [...text.matchAll(/^\s+dev-ref:\s*([0-9a-f]{40})/gm)].map((match) => match[1])
  const signer = [...text.matchAll(/^\s+signer-ref:\s*([0-9a-f]{40})/gm)].map((match) => match[1])
  return { dev: [...dev, ...devRef], signer }
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

  it('the promotion workflows pin ONE dev commit and ONE signer commit', () => {
    const { dev, signer } = promotionPins()
    expect(dev.length).toBeGreaterThanOrEqual(9)
    expect([...new Set(dev)]).toHaveLength(1)
    expect(signer.length).toBeGreaterThanOrEqual(3)
    expect([...new Set(signer)]).toHaveLength(1)
  })
})
