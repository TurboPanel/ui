export const UI_LICENSE: string
export const UI_SOURCE_REPO: string
export function isFullGitCommit(commit: string): boolean
export function sourceReleaseUrl(
  commit: string,
  options?: Readonly<{ release?: boolean }>,
): string
