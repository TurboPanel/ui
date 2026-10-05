import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { effectiveConfig } from './effective-config'
import { checkLinuxUserName, linuxUserRows, resolveRunsAs } from './linux-users'
import { mapLayout, type MapMode } from './map-layout'
import {
  SAMPLE_ENVIRONMENTS,
  sampleDefaultUser,
  sampleMapInput,
  sampleView,
} from './sample-projects.fixtures'

/**
 * Words that must never reach the screen (ia-v4 section 3.1 and rule 11, the
 * v4 plan, and the owner's list). `check:vocabulary` does not cover them yet.
 */
const BANNED =
  /\b(overlays?|overrid(?:e|es|den|ing)|overridden|layers?|lanes?|tenants?|principals?|aliases|alias|inherit(?:s|ed|ance)?|forks?|templates?|delta)\b/i

function collectStrings(value: unknown, into: string[] = []): string[] {
  if (typeof value === 'string') into.push(value)
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, into))
  else if (value !== null && typeof value === 'object') {
    Object.values(value).forEach((item) => collectStrings(item, into))
  }
  return into
}

describe('banned words in the output', () => {
  it('has no banned word in anything the v4 modules return for the sample projects', () => {
    const strings: string[] = []
    for (const [, project, env] of SAMPLE_ENVIRONMENTS) {
      strings.push(
        ...collectStrings(
          effectiveConfig({
            envName: env.name,
            services: project.services,
            base: project.base,
            source: env.source,
          }),
        ),
      )
      for (const mode of ['env', 'base', 'diff'] as readonly MapMode[]) {
        strings.push(...collectStrings(mapLayout(sampleMapInput(project, env, mode))))
      }
      strings.push(
        ...collectStrings(
          linuxUserRows({
            users: project.users,
            services: project.services,
            base: project.base,
            environments: project.environments.map(sampleView),
            defaultUser: sampleDefaultUser(project),
          }),
        ),
      )
      for (const service of project.services) {
        strings.push(
          ...collectStrings(
            resolveRunsAs({
              service,
              base: project.base,
              env: sampleView(env),
              users: project.users,
              defaultUser: sampleDefaultUser(project),
            }),
          ),
        )
      }
    }
    for (const name of ['', 'Bad', 'a'.repeat(40), 'root', 'ok-name']) {
      strings.push(checkLinuxUserName(name).msg)
    }
    expect(strings.length).toBeGreaterThan(500)
    expect(strings.filter((text) => BANNED.test(text))).toEqual([])
  })

  it('has no banned word in any text literal of the v4 sources', () => {
    const dir = path.dirname(fileURLToPath(import.meta.url))
    const sources = fs
      .readdirSync(dir)
      // follows-base.ts and compose-syntax.ts hold compose key and tag names, which are syntax, not copy
      .filter(
        (file) =>
          file.endsWith('.ts') &&
          !/\.(test|fixtures)\.ts$/.test(file) &&
          file !== 'follows-base.ts' &&
          file !== 'compose-syntax.ts',
      )
    expect(sources.length).toBeGreaterThanOrEqual(7)
    const bad: string[] = []
    for (const file of sources) {
      const code = fs
        .readFileSync(path.join(dir, file), 'utf8')
        .replaceAll(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((line) => !/^\s*(\/\/|import\b|\} from\b)/.test(line))
        .join('\n')
      for (const match of code.matchAll(/'([^'\n]*)'|`([^`]*)`/g)) {
        const text = match[1] ?? match[2] ?? ''
        if (BANNED.test(text)) bad.push(`${file}: ${text}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('catches a banned word', () => {
    expect(BANNED.test('Layer card')).toBe(true)
    expect(BANNED.test('the lane')).toBe(true)
    expect(BANNED.test('site owner’s Linux user')).toBe(false)
    expect(BANNED.test('Staging change')).toBe(false)
  })
})
