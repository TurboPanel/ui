'use strict'

/**
 * Metro (Linux FallbackWatcher and macOS NativeWatcher) uses fs.watch /
 * inotify. Host writes on Vagrant VirtioFS / UTM 9p do not notify the guest,
 * so Fast Refresh never fires even though a full reload re-reads files.
 *
 * When the checkout sits on those filesystems (or TURBOPANEL_METRO_POLL=1),
 * poll src/ + root config and emit Metro file events. Do not utimes source —
 * that would fight the host editor.
 */

const fs = require('node:fs')
const path = require('node:path')

const POLL_FS_TYPES = new Set(['9p', 'fuse.virtfs', 'fuse.virtiofs', 'virtiofs'])
const SKIP_DIR_NAMES = new Set([
  'android',
  'coverage',
  'design-system',
  'dist',
  'ios',
  'node_modules',
])
const WATCH_EXTENSIONS = new Set(['.cjs', '.css', '.js', '.json', '.jsx', '.mjs', '.ts', '.tsx'])
const ROOT_WATCH_FILES = [
  'app.config.js',
  'app.config.ts',
  'app.json',
  'babel.config.cjs',
  'babel.config.js',
  'metro.config.js',
]
const DEFAULT_POLL_MS = 400
/**
 * Every Nth tick is a full sweep that re-reads every known folder and stats
 * every watched file. Ticks in between only stat folders and re-read the ones
 * whose mtime changed. An in-place edit does not change the folder mtime, so it
 * is noticed by the next full sweep: at most pollMs * fullEvery (default
 * 400 ms * 3 = 1.2 s). New, deleted and renamed-over files (atomic editor
 * saves) change the folder mtime and are noticed within one pollMs; a create
 * that lands in the same timestamp tick as an earlier readdir (mtime
 * unchanged) is caught by the full sweep's re-read.
 * TURBOPANEL_METRO_POLL_FULL_EVERY=1 stats every file on every tick (the old
 * behaviour).
 */
const DEFAULT_FULL_EVERY = 3
/** Packages Metro/Expo actually instantiate — none are direct deps of this app. */
const WATCHER_SPECS = [
  {
    packageName: 'metro-file-map',
    files: [
      ['src', 'watchers', 'FallbackWatcher.js'],
      ['src', 'watchers', 'NativeWatcher.js'],
    ],
  },
  {
    packageName: '@expo/metro-file-map',
    files: [
      ['build', 'watchers', 'FallbackWatcher.js'],
      ['build', 'watchers', 'NativeWatcher.js'],
    ],
  },
  {
    directIds: [
      '@expo/metro/metro-file-map/watchers/FallbackWatcher',
      '@expo/metro/metro-file-map/watchers/NativeWatcher',
    ],
  },
]
const RESOLVE_SEEDS = ['expo/metro-config', 'metro', 'metro-file-map', '@expo/metro-file-map']

/** @type {WeakMap<object, ReturnType<typeof setInterval>>} */
const pollers = new WeakMap()
let patched = false

/**
 * @param {string} encoded
 * @returns {string}
 */
function decodeMountPoint(encoded) {
  return encoded.replaceAll(/\\([0-7]{3})/g, (_match, octal) =>
    String.fromCodePoint(Number.parseInt(octal, 8))
  )
}

/**
 * @param {string} resolvedPath
 * @param {string} mountPoint
 */
function pathIsInside(resolvedPath, mountPoint) {
  if (mountPoint === '/') {
    return true
  }
  return resolvedPath === mountPoint || resolvedPath.startsWith(`${mountPoint}/`)
}

/**
 * Longest matching /proc/mounts prefix for `resolvedPath`.
 *
 * @param {string} mountsText
 * @param {string} resolvedPath
 * @returns {string | null}
 */
function fsTypeForPath(mountsText, resolvedPath) {
  let bestMount = ''
  let bestType = null
  for (const line of mountsText.split('\n')) {
    if (!line) {
      continue
    }
    const parts = line.split(' ')
    if (parts.length < 3) {
      continue
    }
    const mountPoint = decodeMountPoint(parts[1])
    if (!pathIsInside(resolvedPath, mountPoint)) {
      continue
    }
    if (mountPoint.length < bestMount.length) {
      continue
    }
    bestMount = mountPoint
    bestType = parts[2]
  }
  return bestType
}

/**
 * @param {string | null | undefined} fsType
 */
function isPollFsType(fsType) {
  return Boolean(fsType && POLL_FS_TYPES.has(fsType))
}

/**
 * @param {Readonly<{
 *   env?: { [key: string]: string | undefined }
 *   mountsText?: string
 *   resolvedRoot: string
 * }>} input
 */
function needsPollWatch(input) {
  const flag = input.env?.TURBOPANEL_METRO_POLL
  if (flag === '0' || flag === 'false') {
    return false
  }
  if (flag === '1' || flag === 'true') {
    return true
  }
  const mountsText = input.mountsText ?? ''
  return isPollFsType(fsTypeForPath(mountsText, input.resolvedRoot))
}

/**
 * @param {string} name
 */
function shouldSkipDirName(name) {
  // Every dot-folder is tooling or local state (.git, .expo, nested worktrees).
  return name.startsWith('.') || SKIP_DIR_NAMES.has(name)
}

/**
 * @param {string} name
 */
function isWatchedFileName(name) {
  return WATCH_EXTENSIONS.has(path.extname(name))
}

/**
 * @param {Record<string, { mtimeMs: number, size: number }>} previous
 * @param {Record<string, { mtimeMs: number, size: number }>} current
 */
function collectSnapshotChanges(previous, current) {
  const touched = []
  const deleted = []
  const currentKeys = Object.keys(current).sort((a, b) => a.localeCompare(b))
  for (const rel of currentKeys) {
    const prev = previous[rel]
    const next = current[rel]
    if (
      prev?.mtimeMs !== next.mtimeMs ||
      prev?.ctimeMs !== next.ctimeMs ||
      prev?.size !== next.size
    ) {
      touched.push(rel)
    }
  }
  const previousKeys = Object.keys(previous).sort((a, b) => a.localeCompare(b))
  for (const rel of previousKeys) {
    if (!current[rel]) {
      deleted.push(rel)
    }
  }
  return { deleted, touched }
}

/**
 * Incremental scanner. Keeps the folder tree and per-file stats between ticks.
 * `scan(full)` stats every known folder (cheap), re-reads and re-stats only the
 * folders whose mtime/ctime moved, and on `full` also re-reads every folder and
 * stats every file.
 *
 * @param {string} projectRoot
 * @param {Pick<typeof fs, 'readdirSync' | 'statSync'>} fsApi
 */
function createPollScanner(projectRoot, fsApi) {
  /** @type {Map<string, { mtimeMs: number, ctimeMs: number, files: Set<string>, subdirs: Set<string> }>} */
  const dirs = new Map()
  /** @type {Map<string, { mtimeMs: number, ctimeMs: number, size: number }>} */
  const files = new Map()
  /** @type {Set<string>} */
  let touched = new Set()
  /** @type {Set<string>} */
  let deleted = new Set()

  /** @param {string} abs */
  function forgetFile(abs) {
    if (files.delete(abs)) {
      deleted.add(abs)
      touched.delete(abs)
    }
  }

  /** @param {string} abs */
  function refreshFile(abs) {
    let stat
    try {
      stat = fsApi.statSync(abs)
    } catch {
      // File vanished between readdir and stat.
      forgetFile(abs)
      return
    }
    const prev = files.get(abs)
    if (
      prev?.mtimeMs !== stat.mtimeMs ||
      prev?.ctimeMs !== stat.ctimeMs ||
      prev?.size !== stat.size
    ) {
      touched.add(abs)
      deleted.delete(abs)
    }
    files.set(abs, {
      ctimeMs: stat.ctimeMs,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    })
  }

  /** @param {string} abs */
  function dropDir(abs) {
    const state = dirs.get(abs)
    if (!state) {
      return
    }
    dirs.delete(abs)
    for (const file of state.files) {
      forgetFile(file)
    }
    for (const sub of state.subdirs) {
      dropDir(sub)
    }
  }

  /**
   * @param {string} abs
   * @param {boolean} full
   */
  function scanDir(abs, full) {
    let stat
    try {
      stat = fsApi.statSync(abs)
    } catch {
      // src/ may not exist yet, or the folder was removed.
      dropDir(abs)
      return
    }
    let state = dirs.get(abs)
    if (full || !state || state.mtimeMs !== stat.mtimeMs || state.ctimeMs !== stat.ctimeMs) {
      let entries
      try {
        entries = fsApi.readdirSync(abs, { withFileTypes: true })
      } catch {
        dropDir(abs)
        return
      }
      const nextFiles = new Set()
      const nextDirs = new Set()
      for (const entry of entries) {
        const child = path.join(abs, entry.name)
        if (entry.isDirectory()) {
          if (!shouldSkipDirName(entry.name)) {
            nextDirs.add(child)
          }
        } else if (entry.isFile() && isWatchedFileName(entry.name)) {
          nextFiles.add(child)
        }
      }
      for (const old of state?.files ?? []) {
        if (!nextFiles.has(old)) {
          forgetFile(old)
        }
      }
      for (const old of state?.subdirs ?? []) {
        if (!nextDirs.has(old)) {
          dropDir(old)
        }
      }
      state = {
        ctimeMs: stat.ctimeMs,
        files: nextFiles,
        mtimeMs: stat.mtimeMs,
        subdirs: nextDirs,
      }
      dirs.set(abs, state)
      // A rename-over (atomic save) keeps the name, so re-stat every file.
      for (const file of nextFiles) {
        refreshFile(file)
      }
    }
    for (const sub of state.subdirs) {
      scanDir(sub, full)
    }
  }

  return {
    /**
     * @param {boolean} full
     * @returns {{ touched: string[], deleted: string[], meta: Record<string, { mtimeMs: number, size: number }> }}
     */
    scan(full) {
      touched = new Set()
      deleted = new Set()
      scanDir(path.join(projectRoot, 'src'), full)
      for (const name of ROOT_WATCH_FILES) {
        refreshFile(path.join(projectRoot, name))
      }
      const rel = (abs) => path.relative(projectRoot, abs)
      const sortRel = (set) => [...set].map(rel).sort((a, b) => a.localeCompare(b))
      /** @type {Record<string, { mtimeMs: number, size: number }>} */
      const meta = {}
      for (const abs of touched) {
        const m = files.get(abs)
        if (m) {
          meta[rel(abs)] = m
        }
      }
      return { deleted: sortRel(deleted), meta, touched: sortRel(touched) }
    },
  }
}

function readMountsText() {
  try {
    return fs.readFileSync('/proc/mounts', 'utf8')
  } catch {
    return ''
  }
}

/**
 * pnpm does not hoist metro-file-map to the UI root. Walk from expo/metro-config
 * so nested Metro copies resolve.
 *
 * @param {string} projectRoot
 * @returns {string[]}
 */
function collectResolveRoots(projectRoot) {
  const roots = [path.resolve(projectRoot)]
  for (const id of RESOLVE_SEEDS) {
    try {
      roots.push(path.dirname(require.resolve(id, { paths: roots })))
    } catch {
      // Seed is not installed or not reachable yet.
    }
  }
  return [...new Set(roots)]
}

/**
 * @param {unknown} loaded
 * @returns {Function | null}
 */
function watcherFromModule(loaded) {
  if (!loaded || typeof loaded !== 'object') {
    return typeof loaded === 'function' ? loaded : null
  }
  const Watcher = loaded.default ?? loaded
  return typeof Watcher === 'function' ? Watcher : null
}

/**
 * @param {{ packageName?: string, files?: string[][], directIds?: string[] }} spec
 * @param {string[]} roots
 * @param {(Watcher: Function | null) => void} addClass
 */
function loadWatchersFromSpec(spec, roots, addClass) {
  if (spec.directIds) {
    for (const id of spec.directIds) {
      try {
        addClass(watcherFromModule(require(require.resolve(id, { paths: roots }))))
      } catch {
        // Nested Expo layout is absent on this Metro version.
      }
    }
  }
  if (!spec.packageName || !spec.files) {
    return
  }
  let pkgDir
  try {
    pkgDir = path.dirname(require.resolve(`${spec.packageName}/package.json`, { paths: roots }))
  } catch {
    return
  }
  for (const rel of spec.files) {
    try {
      addClass(watcherFromModule(require(path.join(pkgDir, ...rel))))
    } catch {
      // Watcher file missing for this package layout.
    }
  }
}

/**
 * @param {string} projectRoot
 * @returns {Function[]}
 */
function loadAllWatcherClasses(projectRoot) {
  const roots = collectResolveRoots(projectRoot)
  /** @type {Function[]} */
  const classes = []
  const seen = new Set()
  const addClass = (Watcher) => {
    if (!Watcher || seen.has(Watcher)) {
      return
    }
    seen.add(Watcher)
    classes.push(Watcher)
  }
  for (const spec of WATCHER_SPECS) {
    loadWatchersFromSpec(spec, roots, addClass)
  }
  return classes
}

/**
 * @param {string} watcherRoot
 * @param {string} projectRoot
 */
function watcherCoversProject(watcherRoot, projectRoot) {
  const root = path.resolve(watcherRoot)
  const project = path.resolve(projectRoot)
  if (root === project) {
    return true
  }
  if (root.includes(`${path.sep}node_modules${path.sep}`)) {
    return false
  }
  const src = path.join(project, 'src')
  if (root === src || src.startsWith(`${root}${path.sep}`)) {
    return true
  }
  return root.startsWith(`${project}${path.sep}`)
}

/**
 * @param {object} watcher
 * @param {Record<string, { mtimeMs: number, size: number }>} current
 * @param {string[]} touched
 * @param {string[]} deleted
 */
function emitSnapshotEvents(watcher, current, touched, deleted) {
  if (typeof watcher.emitFileEvent !== 'function') {
    return
  }
  for (const relativePath of touched) {
    const meta = current[relativePath]
    if (!meta) {
      continue
    }
    watcher.emitFileEvent({
      event: 'touch',
      relativePath,
      metadata: {
        modifiedTime: meta.mtimeMs,
        size: meta.size,
        type: 'f',
      },
    })
  }
  for (const relativePath of deleted) {
    watcher.emitFileEvent({ event: 'delete', relativePath })
  }
}

/**
 * @param {object} watcher
 * @param {string} projectRoot
 * @param {Readonly<{
 *   fsApi?: typeof fs
 *   pollMs?: number
 *   fullEvery?: number
 *   log?: (message: string) => void
 *   setIntervalFn?: typeof setInterval
 *   clearIntervalFn?: typeof clearInterval
 * }>} runtime
 */
function attachPoller(watcher, projectRoot, runtime) {
  if (pollers.has(watcher)) {
    return
  }
  if (!watcherCoversProject(watcher.root, projectRoot)) {
    return
  }
  const fsApi = runtime.fsApi ?? fs
  const pollMs = runtime.pollMs ?? DEFAULT_POLL_MS
  const setIntervalFn = runtime.setIntervalFn ?? setInterval
  const fullEvery = Math.max(1, runtime.fullEvery ?? DEFAULT_FULL_EVERY)
  const scanner = createPollScanner(projectRoot, fsApi)
  // Baseline: do not emit events for files that already exist.
  scanner.scan(true)
  let tick = 0
  const timer = setIntervalFn(() => {
    tick += 1
    const { deleted, meta, touched } = scanner.scan(tick % fullEvery === 0)
    emitSnapshotEvents(watcher, meta, touched, deleted)
    if (touched.length > 0 || deleted.length > 0) {
      const log = runtime.log ?? console.log
      log(`[metro] VirtFS poll ${touched.length} touched, ${deleted.length} deleted`)
    }
  }, pollMs)
  if (typeof timer === 'object' && timer && 'unref' in timer) {
    timer.unref()
  }
  pollers.set(watcher, timer)
  const log = runtime.log ?? console.log
  log(`[metro] VirtFS poll watch attached at ${watcher.root}`)
}

/**
 * @param {object} watcher
 * @param {typeof clearInterval} clearIntervalFn
 */
function detachPoller(watcher, clearIntervalFn) {
  const timer = pollers.get(watcher)
  if (!timer) {
    return
  }
  clearIntervalFn(timer)
  pollers.delete(watcher)
}

/**
 * @param {new (...args: unknown[]) => { root: string }} Watcher
 * @param {string} projectRoot
 * @param {object} runtime
 */
function patchWatcherClass(Watcher, projectRoot, runtime) {
  if (!Watcher?.prototype || Watcher.__tpVirtfsPollPatched) {
    return
  }
  Watcher.__tpVirtfsPollPatched = true
  const origStart = Watcher.prototype.startWatching
  const origStop = Watcher.prototype.stopWatching
  Watcher.prototype.startWatching = async function startWatchingWithPoll() {
    attachPoller(this, projectRoot, runtime)
    if (typeof origStart === 'function') {
      await origStart.call(this)
    }
  }
  Watcher.prototype.stopWatching = async function stopWatchingWithPoll() {
    detachPoller(this, runtime.clearIntervalFn ?? clearInterval)
    if (typeof origStop === 'function') {
      await origStop.call(this)
    }
  }
}

/**
 * @param {string} projectRoot
 * @param {Readonly<{
 *   env?: { [key: string]: string | undefined }
 *   mountsText?: string
 *   fsApi?: typeof fs
 *   pollMs?: number
 *   log?: (message: string) => void
 *   patch?: boolean
 * }> | undefined} options
 */
function installMetroPollWatch(projectRoot, options = {}) {
  const env = options.env ?? process.env
  const resolvedRoot = path.resolve(projectRoot)
  const mountsText = options.mountsText ?? readMountsText()
  if (!needsPollWatch({ env, mountsText, resolvedRoot })) {
    return { enabled: false }
  }
  if (options.patch === false) {
    return { enabled: true, patched: false }
  }
  if (patched) {
    return { enabled: true, patched: true }
  }
  const pollMs = Number.parseInt(env.TURBOPANEL_METRO_POLL_MS ?? '', 10)
  const fullEvery = Number.parseInt(env.TURBOPANEL_METRO_POLL_FULL_EVERY ?? '', 10)
  const runtime = {
    fsApi: options.fsApi,
    fullEvery: Number.isFinite(fullEvery) && fullEvery > 0 ? fullEvery : DEFAULT_FULL_EVERY,
    pollMs: Number.isFinite(pollMs) && pollMs > 0 ? pollMs : DEFAULT_POLL_MS,
    log: options.log,
  }
  const watchers = loadAllWatcherClasses(resolvedRoot)
  for (const Watcher of watchers) {
    patchWatcherClass(Watcher, resolvedRoot, runtime)
  }
  if (watchers.length === 0) {
    const log = options.log ?? console.warn
    log('[metro] VirtFS poll watch skipped — metro-file-map watchers were not found')
    return { enabled: true, patched: false }
  }
  patched = true
  const log = options.log ?? console.log
  log(
    `[metro] VirtFS poll watch enabled (${watchers.length} watcher classes) — host edits do not notify inotify on this share`
  )
  return { enabled: true, patched: true }
}

module.exports = {
  DEFAULT_FULL_EVERY,
  POLL_FS_TYPES,
  ROOT_WATCH_FILES,
  WATCHER_SPECS,
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
}
