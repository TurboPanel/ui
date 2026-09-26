import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

function readJsonc(file: string): unknown {
  const raw = readFileSync(path.join(ROOT, file), 'utf8')
  // Strip // and /* */ comments; the config has no strings containing those.
  return JSON.parse(raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''))
}

type Wrangler = { name: string; env: Record<string, { name: string; route?: { pattern: string } }> }

describe('wrangler environments', () => {
  const config = readJsonc('wrangler.jsonc') as Wrangler

  it('pins the deployable environments and their Worker names', () => {
    expect(Object.keys(config.env).sort()).toEqual(['live', 'testing'])
    expect(config.env.testing.name).toBe('testing-ui')
    expect(config.env.testing.route?.pattern).toBe('testing.turbopanel.dev')
    expect(config.env.live.name).toBe('ui')
    expect(config.env.live.route?.pattern).toBe('turbopanel.app')
  })

  it('never lets two environments (or the top level) share a Worker name', () => {
    const names = [config.name, ...Object.values(config.env).map((env) => env.name)]
    expect(new Set(names).size).toBe(names.length)
    // The top level is for local `wrangler dev` only and must not be a real Worker.
    expect(config.name).toBe('dev-ui')
  })

  it('has no default deploy target: only deploy:testing and deploy:live deploy', () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(pkg.scripts['deploy:testing']).toBe('wrangler deploy --env testing')
    expect(pkg.scripts['deploy:live']).toBe('wrangler deploy --env live')
    expect(pkg.scripts.deploy).not.toMatch(/wrangler deploy/)
  })
})
