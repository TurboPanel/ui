import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

// Green-only CI (Road to 0.2.x, phase 1): a red X means "this change is
// broken", and failing code never reaches a canary. These pins keep the
// workflow rules that guarantee it from being dropped in a later edit.
const dir = join(__dirname, '..', '.github', 'workflows')
const files = readdirSync(dir).filter((f) => f.endsWith('.yml'))
const text = (f: string) => readFileSync(join(dir, f), 'utf8')

type Job = { if?: string; permissions?: unknown; name?: string }
type Workflow = { name: string; permissions?: Record<string, string>; jobs: Record<string, Job> }
const workflow = (f: string) => parse(text(f)) as Workflow

// Small words stay lower case; RC, PR and the like stay upper case.
const SMALL = new Set(['a', 'an', 'and', 'for', 'of', 'on', 'or', 'the', 'to'])
const titleCase = (name: string) =>
  name.split(' ').every((w, i) => (i > 0 && SMALL.has(w)) || /^[A-Z\d]/.test(w))

describe('every workflow', () => {
  it.each(files)('%s declares a read-only top-level token', (f) => {
    const permissions = workflow(f).permissions
    expect(permissions).toBeDefined()
    expect(Object.values(permissions ?? {})).not.toContain('write')
  })

  it.each(files)('%s has a Title Case name', (f) => {
    expect(titleCase(workflow(f).name)).toBe(true)
  })
})

describe('canary', () => {
  const canary = workflow('canary.yml')

  it('publishes only after a green Verify from a push to trunk', () => {
    const gate = canary.jobs.publish.if ?? ''
    expect(gate).toContain("github.event.workflow_run.conclusion == 'success'")
    expect(gate).toContain("github.event.workflow_run.event == 'push'")
    expect(gate).toContain("github.event.workflow_run.head_branch == 'trunk'")
    expect(text('canary.yml')).toContain('ref: ${{ github.event.workflow_run.head_sha }}')
  })

  it('never lets an ignored run cancel a real canary', () => {
    expect(text('canary.yml')).toMatch(
      /group: \$\{\{ github\.event\.workflow_run\.event == 'push' && 'canary' \|\| format\('canary-ignored-\{0\}', github\.run_id\) \}\}/
    )
  })
})

describe('green Verify lookups', () => {
  it('count only push runs', () => {
    const lookups = files.flatMap((f) =>
      text(f)
        .split('\n')
        .filter((line) => /gh run list .*--workflow (Verify|verify\.yml)/.test(line))
    )
    expect(lookups.length).toBeGreaterThan(0)
    for (const line of lookups) expect(line).toContain('--event push')
  })
})

describe('ci-ok', () => {
  const ciOk = workflow('verify.yml').jobs['ci-ok']

  it('keeps its required-check name', () => {
    expect(ciOk.name).toBe('ci-ok')
  })

  it('always reports on a PR, and stays grey on a cancelled push run', () => {
    const gate = (ciOk.if ?? '').replace(/\s+/g, ' ')
    expect(gate).toContain("(github.event_name == 'pull_request' && always())")
    expect(gate).toContain("(!cancelled() && !contains(needs.*.result, 'cancelled'))")
  })
})
