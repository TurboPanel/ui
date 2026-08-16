export const POLL_FS_TYPES: ReadonlySet<string>

export const WATCHER_SPECS: ReadonlyArray<{
  packageName?: string
  files?: string[][]
  directIds?: string[]
}>

export function decodeMountPoint(encoded: string): string

export function fsTypeForPath(
  mountsText: string,
  resolvedPath: string,
): string | null

export function isPollFsType(fsType: string | null | undefined): boolean

export function needsPollWatch(input: {
  env?: Record<string, string | undefined>
  mountsText?: string
  resolvedRoot: string
}): boolean

export function shouldSkipDirName(name: string): boolean

export function isWatchedFileName(name: string): boolean

export function watcherCoversProject(
  watcherRoot: string,
  projectRoot: string,
): boolean

export function collectSnapshotChanges(
  previous: Record<
    string,
    { mtimeMs: number; size: number; ctimeMs?: number }
  >,
  current: Record<string, { mtimeMs: number; size: number; ctimeMs?: number }>,
): { deleted: string[]; touched: string[] }

export function installMetroPollWatch(
  projectRoot: string,
  options?: {
    env?: Record<string, string | undefined>
    mountsText?: string
    patch?: boolean
  },
): { enabled: boolean; patched?: boolean }
