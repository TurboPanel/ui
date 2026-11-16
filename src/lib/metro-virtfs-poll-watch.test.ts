import * as fs from 'node:fs'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  collectSnapshotChanges,
  createPollScanner,
  decodeMountPoint,
  fsTypeForPath,
  installMetroPollWatch,
  isPollFsType,
  isWatchedFileName,
  needsPollWatch,
  shouldSkipDirName,
  watcherCoversProject,
  WATCHER_SPECS,
} from '../../scripts/metro-virtfs-poll-watch.cjs'

const METRO_CONFIG = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../metro.config.js'),
  'utf8'
)

const VIRTIOFS_MOUNTS = [
  'tmpfs / tmpfs rw 0 0',
  'virtiofs /home/vagrant/ui virtiofs rw,relatime 0 0',
  '/dev/vda1 /var ext4 rw,relatime 0 0',
].join('\n')

const NINEP_MOUNTS = [
  'rootfs / rootfs rw 0 0',
  'ui /home/vagrant/ui 9p rw,dirsync,relatime,trans=virtio 0 0',
].join('\n')

describe('decodeMountPoint', () => {
  it('decodes octal-escaped spaces from /proc/mounts', () => {
    expect(decodeMountPoint('/home/user/My\\040UI')).toBe('/home/user/My UI')
  })
})

describe('fsTypeForPath', () => {
  it('picks the longest matching mount prefix', () => {
    expect(fsTypeForPath(VIRTIOFS_MOUNTS, '/home/vagrant/ui')).toBe('virtiofs')
    expect(fsTypeForPath(VIRTIOFS_MOUNTS, '/home/vagrant/ui/src/app.tsx')).toBe('virtiofs')
    expect(fsTypeForPath(VIRTIOFS_MOUNTS, '/var/lib/pnpm')).toBe('ext4')
    expect(fsTypeForPath(VIRTIOFS_MOUNTS, '/')).toBe('tmpfs')
  })

  it('detects UTM VirtFS 9p shares', () => {
    expect(fsTypeForPath(NINEP_MOUNTS, '/home/vagrant/ui/src')).toBe('9p')
  })
})

describe('isPollFsType', () => {
  it('matches VirtioFS and 9p, not local disks', () => {
    expect(isPollFsType('virtiofs')).toBe(true)
    expect(isPollFsType('fuse.virtiofs')).toBe(true)
    expect(isPollFsType('9p')).toBe(true)
    expect(isPollFsType('ext4')).toBe(false)
    expect(isPollFsType('tmpfs')).toBe(false)
    expect(isPollFsType(null)).toBe(false)
  })
})

describe('needsPollWatch', () => {
  const resolvedRoot = '/home/vagrant/ui'

  it('forces on and off via TURBOPANEL_METRO_POLL', () => {
    expect(
      needsPollWatch({
        env: { TURBOPANEL_METRO_POLL: '1' },
        mountsText: '',
        resolvedRoot,
      })
    ).toBe(true)
    expect(
      needsPollWatch({
        env: { TURBOPANEL_METRO_POLL: '0' },
        mountsText: VIRTIOFS_MOUNTS,
        resolvedRoot,
      })
    ).toBe(false)
  })

  it('enables on VirtioFS checkouts and skips local disks', () => {
    expect(
      needsPollWatch({
        env: {},
        mountsText: VIRTIOFS_MOUNTS,
        resolvedRoot,
      })
    ).toBe(true)
    expect(
      needsPollWatch({
        env: {},
        mountsText: '/dev/nvme0n1p1 /home ext4 rw 0 0\n',
        resolvedRoot: '/home/muncherelli/Development/turbopanel/ui',
      })
    ).toBe(false)
  })
})

describe('watch filters', () => {
  it('skips bind-mounted and generated trees', () => {
    expect(shouldSkipDirName('node_modules')).toBe(true)
    expect(shouldSkipDirName('.claude')).toBe(true)
    expect(shouldSkipDirName('src')).toBe(false)
    // Source lives at src/components/org/logs — do not treat the name as cache.
    expect(shouldSkipDirName('logs')).toBe(false)
  })

  it('watches source and config extensions', () => {
    expect(isWatchedFileName('form-select.tsx')).toBe(true)
    expect(isWatchedFileName('metro.config.js')).toBe(true)
    expect(isWatchedFileName('logo.png')).toBe(false)
  })
})

describe('metro.config.js blockList', () => {
  it('does not treat src/components/org/logs as a cache directory', () => {
    expect(METRO_CONFIG).not.toContain(String.raw`/(^|[/\\])logs([/\\].*)?$/`)
    expect(METRO_CONFIG).toContain("path.resolve(__dirname, 'logs')")
    expect(METRO_CONFIG).toContain('src/components/org/logs')
  })
})

describe('collectSnapshotChanges', () => {
  it('reports new, changed, and deleted files', () => {
    const previous = {
      'src/a.tsx': { mtimeMs: 1, size: 10 },
      'src/gone.tsx': { mtimeMs: 1, size: 4 },
    }
    const current = {
      'src/a.tsx': { mtimeMs: 2, size: 10 },
      'src/b.tsx': { mtimeMs: 1, size: 8 },
    }
    expect(collectSnapshotChanges(previous, current)).toEqual({
      deleted: ['src/gone.tsx'],
      touched: ['src/a.tsx', 'src/b.tsx'],
    })
  })

  it('treats the first snapshot as all-new', () => {
    expect(collectSnapshotChanges({}, { 'src/a.tsx': { mtimeMs: 1, size: 1 } })).toEqual({
      deleted: [],
      touched: ['src/a.tsx'],
    })
  })

  it('emits nothing when mtime and size are unchanged', () => {
    const snapshot = { 'src/a.tsx': { mtimeMs: 1, size: 4 } }
    expect(collectSnapshotChanges(snapshot, snapshot)).toEqual({
      deleted: [],
      touched: [],
    })
  })
})

describe('installMetroPollWatch', () => {
  it('no-ops on a local disk without patching Metro', () => {
    expect(
      installMetroPollWatch('/tmp/ui', {
        env: {},
        mountsText: '/dev/sda1 /tmp ext4 rw 0 0\n',
        patch: false,
      })
    ).toEqual({ enabled: false })
  })

  it('reports enabled without requiring metro-file-map when patch is skipped', () => {
    expect(
      installMetroPollWatch('/tmp/ui', {
        env: { TURBOPANEL_METRO_POLL: '1' },
        mountsText: '',
        patch: false,
      })
    ).toEqual({ enabled: true, patched: false })
  })
})

describe('watcherCoversProject', () => {
  const project = '/home/vagrant/ui'

  it('covers the project root and src, not node_modules', () => {
    expect(watcherCoversProject(project, project)).toBe(true)
    expect(watcherCoversProject(`${project}/src`, project)).toBe(true)
    expect(watcherCoversProject(`${project}/node_modules/metro`, project)).toBe(false)
    expect(watcherCoversProject('/var/lib/pnpm', project)).toBe(false)
  })
})

describe('WATCHER_SPECS', () => {
  it('includes the Expo and upstream Metro file-map packages', () => {
    const names = WATCHER_SPECS.map((spec) => spec.packageName).filter(Boolean)
    expect(names).toContain('metro-file-map')
    expect(names).toContain('@expo/metro-file-map')
  })
})

describe('createPollScanner', () => {
  let root = ''
  afterEach(() => {
    if (root) fs.rmSync(root, { force: true, recursive: true })
    root = ''
  })

  function setup() {
    root = fs.mkdtempSync(join(tmpdir(), 'metro-poll-'))
    fs.mkdirSync(join(root, 'src/a/deep'), { recursive: true })
    fs.mkdirSync(join(root, 'src/.claude/worktrees/x/src'), { recursive: true })
    fs.writeFileSync(join(root, 'src/a/one.ts'), '1')
    fs.writeFileSync(join(root, 'src/a/deep/two.tsx'), '2')
    fs.writeFileSync(join(root, 'src/.claude/worktrees/x/src/skip.ts'), 's')
    fs.writeFileSync(join(root, 'src/a/note.md'), 'ignored')
    fs.writeFileSync(join(root, 'app.json'), '{}')
    const calls = { readdir: 0, stat: 0 }
    const fsApi = {
      readdirSync: ((...args: unknown[]) => {
        calls.readdir += 1
        return (fs.readdirSync as (...a: unknown[]) => unknown)(...args)
      }) as typeof fs.readdirSync,
      statSync: ((...args: unknown[]) => {
        calls.stat += 1
        return (fs.statSync as (...a: unknown[]) => unknown)(...args)
      }) as typeof fs.statSync,
    }
    const scanner = createPollScanner(root, fsApi)
    const baseline = scanner.scan(true)
    return { baseline, calls, scanner }
  }

  function bump(file: string, seconds: number) {
    const t = new Date(Date.now() + seconds * 1000)
    fs.utimesSync(file, t, t)
  }

  it('baselines watched files and skips .claude worktrees', () => {
    const { baseline } = setup()
    expect(baseline.touched).toEqual(['app.json', 'src/a/deep/two.tsx', 'src/a/one.ts'])
  })

  it('does not stat files on a quiet light tick, but does on a full sweep', () => {
    const { calls, scanner } = setup()
    calls.stat = 0
    expect(scanner.scan(false)).toMatchObject({ deleted: [], touched: [] })
    // 3 folders (src, src/a, src/a/deep; .claude skipped) + 6 root-file probes.
    const light = calls.stat
    expect(light).toBe(3 + 6)
    expect(calls.readdir).toBe(3) // baseline only
    calls.stat = 0
    scanner.scan(true)
    expect(calls.stat).toBe(light + 2) // plus the two src files
  })

  it('detects an in-place edit only on the next full sweep', () => {
    const { scanner } = setup()
    fs.writeFileSync(join(root, 'src/a/one.ts'), 'edited!')
    bump(join(root, 'src/a/one.ts'), 5)
    expect(scanner.scan(false).touched).toEqual([])
    expect(scanner.scan(true).touched).toEqual(['src/a/one.ts'])
    expect(scanner.scan(true).touched).toEqual([])
  })

  it('detects new and deleted files on a light tick', () => {
    const { scanner } = setup()
    fs.writeFileSync(join(root, 'src/a/deep/new.ts'), 'n')
    fs.mkdirSync(join(root, 'src/b'))
    fs.writeFileSync(join(root, 'src/b/fresh.ts'), 'f')
    bump(join(root, 'src/a/deep'), 3)
    bump(join(root, 'src'), 3)
    const added = scanner.scan(false)
    expect(added.touched).toEqual(['src/a/deep/new.ts', 'src/b/fresh.ts'])
    fs.rmSync(join(root, 'src/a/deep/new.ts'))
    bump(join(root, 'src/a/deep'), 6)
    fs.rmSync(join(root, 'src/b'), { force: true, recursive: true })
    bump(join(root, 'src'), 6)
    const removed = scanner.scan(false)
    expect(removed.deleted).toEqual(['src/a/deep/new.ts', 'src/b/fresh.ts'])
  })

  it('detects an atomic rename-over save on a light tick', () => {
    const { scanner } = setup()
    fs.writeFileSync(join(root, 'src/a/one.ts.tmp'), 'swapped')
    fs.renameSync(join(root, 'src/a/one.ts.tmp'), join(root, 'src/a/one.ts'))
    bump(join(root, 'src/a'), 4)
    expect(scanner.scan(false).touched).toEqual(['src/a/one.ts'])
  })
})
