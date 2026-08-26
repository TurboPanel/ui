import { describe, expect, it } from 'vitest'
import {
  detectedComposePath,
  rankRepositoryLanes,
  recommendedLane,
  rootFromEntries,
} from './repository-lane'

const files = (...present: string[]) =>
  [
    'docker-compose.yml',
    'compose.yaml',
    'composer.json',
    'package.json',
    'index.php',
    'index.html',
    'Dockerfile',
  ].map((path) => ({ path, found: present.includes(path) }))

describe('rankRepositoryLanes', () => {
  it('prefers a compose file over everything else', () => {
    const ranked = rankRepositoryLanes(files('docker-compose.yml', 'package.json'))
    expect(recommendedLane(ranked)).toBe('compose')
  })

  it('prefers PHP over an app runtime when both are present', () => {
    const ranked = rankRepositoryLanes(files('composer.json', 'package.json'))
    expect(recommendedLane(ranked)).toBe('site-php')
  })

  it('falls back to static when only markup is present', () => {
    const ranked = rankRepositoryLanes(files('index.html'))
    expect(recommendedLane(ranked)).toBe('static')
  })

  it('recommends nothing when the repository matches no lane', () => {
    const ranked = rankRepositoryLanes(files())
    expect(recommendedLane(ranked)).toBeUndefined()
    // Every lane is still offered — the operator decides.
    expect(ranked).toHaveLength(4)
  })

  it('reports the evidence that chose each lane, including its absence', () => {
    // This is what turns an override into an informed act rather than a guess:
    // the card says WHY it is or is not the default.
    const ranked = rankRepositoryLanes(files('composer.json'))
    const byLane = Object.fromEntries(ranked.map((c) => [c.lane, c.evidence]))
    expect(byLane['site-php']).toBe('composer.json')
    expect(byLane.compose).toBe('no compose file found')
    expect(byLane.app).toBe('no package.json found')
  })

  it('treats an ambiguous repository as a ranking, not a refusal', () => {
    // Dockerfile + package.json + public/ — intent is not in the files, so the
    // ranking picks a default and shows every alternative with its evidence.
    const ranked = rankRepositoryLanes(
      files('Dockerfile', 'package.json'),
      [{ path: 'public', kind: 'dir' }],
    )
    expect(recommendedLane(ranked)).toBe('app')
    expect(ranked.find((c) => c.lane === 'static')?.evidence).toBe('public')
  })

  it('recognizes compose.yml, PHP index, and a dist/ document root', () => {
    const compose = rankRepositoryLanes([
      { path: 'compose.yml', found: true },
    ])
    expect(recommendedLane(compose)).toBe('compose')
    expect(detectedComposePath([{ path: 'docker-compose.yaml', found: true }])).toBe(
      'docker-compose.yaml',
    )

    const php = rankRepositoryLanes([{ path: 'index.php', found: true }])
    expect(recommendedLane(php)).toBe('site-php')

    const dist = rankRepositoryLanes([], [{ path: 'dist', kind: 'dir' }])
    expect(recommendedLane(dist)).toBe('static')
    expect(rootFromEntries([{ path: 'dist', kind: 'dir' }])).toBe('dist')
  })
})

describe('detectedComposePath', () => {
  it('names the compose file the repository actually has', () => {
    expect(detectedComposePath(files('compose.yaml'))).toBe('compose.yaml')
    expect(detectedComposePath(files())).toBeUndefined()
  })
})

describe('rootFromEntries', () => {
  it('honours the two document-root conventions, preferring public', () => {
    expect(
      rootFromEntries([
        { path: 'dist', kind: 'dir' },
        { path: 'public', kind: 'dir' },
      ]),
    ).toBe('public')
    expect(rootFromEntries([{ path: 'dist', kind: 'dir' }])).toBe('dist')
  })

  it('ignores files that merely share the name', () => {
    // `public` as a FILE is not a document root; seeding one would point the
    // engine at something it cannot serve.
    expect(rootFromEntries([{ path: 'public', kind: 'file' }])).toBeUndefined()
  })

  it('returns undefined so the caller keeps the daemon default', () => {
    expect(rootFromEntries([])).toBeUndefined()
  })
})
