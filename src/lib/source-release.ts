export const UI_LICENSE = 'AGPL-3.0-only'
export const UI_SOURCE_REPO = 'https://github.com/TurboPanel/ui'

const FULL_GIT_COMMIT = /^[0-9a-f]{40}$/i

export type AppSourceRelease = Readonly<{
  license: string
  version: string
  build: string
  gitCommit: string
  sourceReleaseUrl: string
  release: boolean
}>

export type SourceReleaseConfig = Readonly<{
  version?: string
  ios?: Readonly<{ buildNumber?: string }>
  android?: Readonly<{ versionCode?: number }>
  extra?: Readonly<Record<string, unknown>>
}>

export function isFullGitCommit(commit: string): boolean {
  return FULL_GIT_COMMIT.test(commit.trim())
}

export function isReleaseSourceConfig(config: SourceReleaseConfig | null | undefined): boolean {
  return config?.extra?.release === true
}

export function sourceReleaseUrl(
  commit: string,
  options?: Readonly<{ release?: boolean }>,
): string {
  const hash = commit.trim()
  if (options?.release) {
    if (!isFullGitCommit(hash)) {
      throw new TypeError('release source URL requires a full git commit')
    }
    return `${UI_SOURCE_REPO}/tree/${hash}`
  }
  if (!hash) return UI_SOURCE_REPO
  return `${UI_SOURCE_REPO}/tree/${hash}`
}

export function readAppSourceRelease(
  config: SourceReleaseConfig | null | undefined,
): AppSourceRelease {
  const extra = config?.extra ?? {}
  const gitCommit = typeof extra.gitCommit === 'string' ? extra.gitCommit.trim() : ''
  const license = typeof extra.license === 'string' && extra.license.trim()
    ? extra.license.trim()
    : UI_LICENSE
  const configuredUrl = typeof extra.sourceReleaseUrl === 'string'
    ? extra.sourceReleaseUrl.trim()
    : ''
  const version = config?.version?.trim() || '0.0.0'
  const iosBuild = config?.ios?.buildNumber?.trim()
  const androidBuild = config?.android?.versionCode
  let build = ''
  if (iosBuild) {
    build = iosBuild
  } else if (typeof androidBuild === 'number') {
    build = String(androidBuild)
  }
  const release = extra.release === true
  if (release) {
    if (!isFullGitCommit(gitCommit)) {
      throw new TypeError('release-mode config requires a full git commit')
    }
    const url = sourceReleaseUrl(gitCommit, { release: true })
    if (!url.includes(`/tree/${gitCommit}`)) {
      throw new TypeError('release source URL must name the exact revision')
    }
    return {
      license,
      version,
      build,
      gitCommit,
      sourceReleaseUrl: url,
      release: true,
    }
  }
  return {
    license,
    version,
    build,
    gitCommit,
    sourceReleaseUrl: configuredUrl || sourceReleaseUrl(gitCommit),
    release: false,
  }
}

export function formatVersionBuild(release: AppSourceRelease): string {
  if (release.build) return `${release.version} (${release.build})`
  return release.version
}
