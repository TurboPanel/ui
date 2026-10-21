import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const APP = path.join(ROOT, 'src', 'app')

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else yield full
  }
}

describe('the web bundle', () => {
  it('has no test or fixture file under src/app: the router bundles every file there as a route', () => {
    const stray = [...walk(APP)]
      .map((file) => path.relative(ROOT, file))
      .filter((file) => /\.(test|spec|fixtures?)\.[cm]?[jt]sx?$/.test(file))
    expect(stray).toEqual([])
  })
})
