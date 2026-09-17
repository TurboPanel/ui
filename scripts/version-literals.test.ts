import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

function read(file: string): string {
  return readFileSync(path.join(ROOT, file), 'utf8')
}

describe('version literals', () => {
  it('package.json, app.json and sonar.projectVersion carry the same semver', () => {
    const pkg = JSON.parse(read('package.json')) as { version: string }
    const app = JSON.parse(read('app.json')) as { expo: { version: string } }
    const sonar = /^sonar\.projectVersion=(.+)$/m.exec(read('sonar-project.properties'))?.[1]?.trim()
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/)
    expect(app.expo.version).toBe(pkg.version)
    expect(sonar).toBe(pkg.version)
  })
})
