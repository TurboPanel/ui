import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { withDevelopmentClientNativeNetwork } from './src/lib/metro-cleartext-node.mjs'
import { isFullGitCommit, sourceReleaseUrl, UI_LICENSE, UI_SOURCE_REPO } from './src/lib/source-release-node.mjs'

/** FHS git — do not resolve `git` from PATH (typescript:S4036). */
const GIT_BIN = '/usr/bin/git'

const require = createRequire(import.meta.url)
const appJson = require('./app.json') as {
  expo: Record<string, unknown> & {
    extra?: Record<string, unknown>
    ios?: { buildNumber?: string }
    android?: { versionCode?: number }
  }
}

function isReleaseBuild(): boolean {
  if (process.env.EAS_BUILD === 'true') return true
  if (process.env.EAS_UPDATE === 'true') return true
  if (process.env.npm_lifecycle_event === 'eas:update') return true
  return false
}

function resolveGitCommit(): string {
  const fromEnv = (
    process.env.EAS_BUILD_GIT_COMMIT_HASH ||
    process.env.EXPO_PUBLIC_GIT_COMMIT ||
    process.env.GITHUB_SHA ||
    ''
  ).trim()
  if (fromEnv) return fromEnv
  try {
    return execFileSync(GIT_BIN, ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

export default function appConfig() {
  const release = isReleaseBuild()
  const gitCommit = resolveGitCommit()
  if (release && !isFullGitCommit(gitCommit)) {
    throw new Error(
      'app.config: production EAS Build, store build, and EAS Update require a full git commit for Corresponding Source',
    )
  }
  let releaseUrl = UI_SOURCE_REPO
  if (release) {
    releaseUrl = sourceReleaseUrl(gitCommit, { release: true })
  } else if (gitCommit) {
    releaseUrl = sourceReleaseUrl(gitCommit)
  }
  return withDevelopmentClientNativeNetwork({
    ...appJson.expo,
    extra: {
      ...appJson.expo.extra,
      license: UI_LICENSE,
      gitCommit,
      sourceReleaseUrl: releaseUrl,
      release,
    },
  })
}
