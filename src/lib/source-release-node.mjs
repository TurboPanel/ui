/**
 * Node-resolvable source-release helpers for `app.config.ts`.
 *
 * Expo compiles the config to `app.config.js` and evaluates it with Node ESM,
 * which does not resolve an extensionless `./src/lib/source-release` to the
 * TypeScript module. Named `source-release-node` so Vite/Metro do not pick
 * this file when resolving `@/lib/source-release`.
 */

export const UI_LICENSE = 'AGPL-3.0-only'
export const UI_SOURCE_REPO = 'https://github.com/TurboPanel/ui'

const FULL_GIT_COMMIT = /^[0-9a-f]{40}$/i

/** @param {string} commit */
export function isFullGitCommit(commit) {
  return FULL_GIT_COMMIT.test(commit.trim())
}

/**
 * @param {string} commit
 * @param {Readonly<{ release?: boolean }> | undefined} [options]
 */
export function sourceReleaseUrl(commit, options) {
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
