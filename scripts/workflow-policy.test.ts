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

/**
 * The text of every `run:` step in a workflow file (single-line and block
 * scalars), found by indentation so no YAML parser is needed.
 */
function runBodies(source: string): string[] {
  const lines = source.split('\n')
  const bodies: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const match = /^(\s*)(?:- )?run:\s*(.*)$/.exec(lines[i])
    if (!match) continue
    const indent = match[1].length
    if (!/^[|>][+-]?$/.test(match[2].trim())) {
      bodies.push(match[2])
      continue
    }
    const body: string[] = []
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j]
      if (line.trim() !== '' && line.length - line.trimStart().length <= indent) break
      body.push(line)
    }
    bodies.push(body.join('\n'))
  }
  return bodies
}

/** Values an outsider can shape (a tag name, a dispatch input, a job output built from one). */
const SHELL_UNSAFE =
  /\$\{\{\s*(inputs\.|github\.ref_name|github\.head_ref|needs\.[\w-]+\.outputs\.)/

type Job = { if?: string; permissions?: unknown; name?: string }
type Workflow = { name: string; permissions?: Record<string, string>; jobs: Record<string, Job> }
const workflow = (f: string) => parse(text(f)) as Workflow

// Small words stay lower case; RC, PR and the like stay upper case.
const SMALL = new Set(['a', 'an', 'and', 'for', 'of', 'on', 'or', 'the', 'to'])
const titleCase = (name: string) =>
  name.split(' ').every((w, i) => (i > 0 && SMALL.has(w)) || /^[A-Z\d]/.test(w))

// Explicit per-file allowances for write scopes at the top level.
const ALLOWED_WRITES: Record<string, string[]> = {
  'osv-scheduled.yml': ['issues'], // opens the weekly OSV sweep issue
}

describe('every workflow', () => {
  it.each(files)('%s declares a read-only top-level token', (f) => {
    const permissions = workflow(f).permissions
    expect(permissions).toBeDefined()
    const writes = Object.entries(permissions ?? {})
      .filter(([, level]) => level === 'write')
      .map(([scope]) => scope)
    expect(writes).toEqual(ALLOWED_WRITES[f] ?? [])
  })

  it.each(files)('%s has a Title Case name', (f) => {
    expect(titleCase(workflow(f).name)).toBe(true)
  })
})

describe('canary', () => {
  const canary = workflow('canary.yml')

  it('publishes only after a green Verify that tested the trunk commit (a push or a manual run)', () => {
    const gate = (canary.jobs.publish.if ?? '').replace(/\s+/g, ' ')
    expect(gate).toContain("github.event.workflow_run.conclusion == 'success'")
    expect(gate).toContain(
      "(github.event.workflow_run.event == 'push' || github.event.workflow_run.event == 'workflow_dispatch')"
    )
    expect(gate).not.toContain('pull_request')
    expect(gate).toContain("github.event.workflow_run.head_branch == 'trunk'")
    expect(text('canary.yml')).toContain('ref: ${{ github.event.workflow_run.head_sha }}')
  })

  it('queues every green trunk push instead of dropping superseded ones', () => {
    expect(text('canary.yml')).toContain('  cancel-in-progress: false\n  queue: max\n')
  })

  it('never lets an ignored run cancel a real canary, and queues manual runs with pushes', () => {
    // One queue for every canary that publishes: the canary number is one past
    // the highest build of its version, which is only safe one build at a time.
    expect(text('canary.yml')).toContain(
      "group: ${{ (github.event.workflow_run.event == 'push' || github.event.workflow_run.event == 'workflow_dispatch') && 'canary' || format('canary-ignored-{0}', github.run_id) }}"
    )
  })
})

describe('green Verify lookups', () => {
  it('count only runs that tested the trunk commit (a push or a manual run), never a PR run', () => {
    const lookups = files.flatMap((f) =>
      text(f)
        .split('\n')
        .filter((line) => /gh run list .*--workflow (Verify|verify\.yml)/.test(line))
    )
    expect(lookups.length).toBeGreaterThan(0)
    for (const line of lookups) {
      expect(line).toContain('select(.event == "push" or .event == "workflow_dispatch")')
      expect(line).not.toContain('pull_request')
    }
  })
})

describe('Verify concurrency', () => {
  it('cancels superseded PR runs but queues every trunk push', () => {
    expect(text('verify.yml')).toContain(
      [
        'concurrency:',
        "  group: ui-verify-${{ github.event_name }}-${{ (github.head_ref == 'trunk' || github.head_ref == 'staging') && github.run_id || github.ref }}",
        "  cancel-in-progress: ${{ github.event_name == 'pull_request' && github.head_ref != 'trunk' && github.head_ref != 'staging' }}",
        "  queue: ${{ github.event_name == 'pull_request' && 'single' || 'max' }}",
        '',
      ].join('\n')
    )
  })

  it('never cancels a promotion PR run (head trunk or staging): its group ends in the run id', () => {
    expect(text('promote-ok.yml')).toContain(
      "cancel-in-progress: ${{ github.head_ref != 'trunk' && github.head_ref != 'staging' }}"
    )
    expect(text('promote-ok.yml')).toContain("format('-{0}', github.run_id)")
    expect(text('promote-prs.yml')).toContain('  cancel-in-progress: false\n  queue: max\n')
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

// Versions come from git tags (Road to 0.2.x, versioning Phase 3): no "Start
// x.y.z" PR, no minor gate, no version read from package.json by a release
// step; minors and majors are started by turbopaneld's Start Next Version.
describe('versions from tags', () => {
  const GONE = [
    /gh-next-version/,
    /gh-minor-gate|minor-gate/,
    /start-minor/,
    /--label minor/,
    /--title "Start /,
  ]

  it.each(files)('%s opens no Start PR, has no minor gate and reads no version file', (f) => {
    for (const gone of GONE) expect(text(f)).not.toMatch(gone)
    expect(text(f)).not.toMatch(/contents\/package\.json|version-file:|GITHUB_RUN_NUMBER/)
  })

  it('works out the canary version from the tags and stamps the base before the export', () => {
    const release = text('release.yml')
    expect(release).toMatch(
      /uses: TurboPanel\/dev\/\.github\/actions\/version@[0-9a-f]{40} # dev#\d+\n {8}with:\n {10}mode: canary\n/
    )
    const stamp = release.indexOf('- name: Stamp the version into app.json and package.json')
    const exported = release.indexOf('- name: Export the web app')
    expect(stamp).toBeGreaterThan(0)
    expect(exported).toBeGreaterThan(stamp)
    expect(release).toContain('BASE_VERSION: ${{ needs.prepare.outputs.base }}')
    expect(release).toContain('app.expo.version = version;')
    expect(release).not.toContain('Require the tag to match package.json')
  })

  it('hands gh-promote the canary found by commit, not a run number', () => {
    expect(text('publish-rc.yml')).toContain('source: ${{ needs.resolve.outputs.canary }}')
  })

  it('pins one TurboPanel/dev commit across the promotion workflows', () => {
    const pins = new Set<string>()
    for (const f of [
      'publish-rc.yml',
      'publish-release.yml',
      'promote-prs.yml',
      'promote-ok.yml',
      'promote-ok-recheck.yml',
    ]) {
      for (const m of text(f).matchAll(
        /TurboPanel\/dev\/\.github\/(?:workflows\/[\w.-]+|actions\/version)@([0-9a-f]{40})/g
      )) {
        pins.add(m[1])
      }
      for (const m of text(f).matchAll(/^ +(?:dev-)?ref: ([0-9a-f]{40})(?: #.*)?$/gm))
        pins.add(m[1])
    }
    expect([...pins]).toHaveLength(1)
  })
})

describe('shell safety', () => {
  it.each(files)('%s passes inputs, the ref name and job outputs through env:', (f) => {
    for (const body of runBodies(text(f))) expect(body).not.toMatch(SHELL_UNSAFE)
  })
})
