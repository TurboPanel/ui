import { apiErrorCopy, CONTROL_PLANE_UNREACHABLE_COPY, isNetworkFetchError } from '@/lib/user-error'

/**
 * What went wrong reading a repository in the create wizard, as one of the
 * few answers the screen words differently.
 *
 * Read from the thrown message, the same way every other API error here is
 * matched: `apiFetch` throws `<path> failed: HTTP <status>: <code> — <text>`.
 * Only the code is trusted. The rest is never shown, because on an older
 * control plane it carries git's own stderr and the request URL.
 */
export type RepositoryReadProblem =
  | 'ref_not_found'
  | 'invalid_ref'
  | 'no_server'
  | 'timeout'
  | 'unreachable'
  | 'other'

const API_CODE_RE = /HTTP \d{3}: ([a-z_]+)/

/**
 * What git prints for a ref the remote does not have. A control plane from
 * before `ref_not_found` existed answered 502 with this text, so it is still
 * recognised: the UI may ship before the server it talks to.
 */
const GIT_REF_NOT_FOUND_RE = /couldn't find remote ref|remote branch .+ not found/i

export function classifyRepositoryReadError(err: unknown): RepositoryReadProblem {
  if (isNetworkFetchError(err)) return 'unreachable'
  const message = err instanceof Error ? err.message : ''
  const code = API_CODE_RE.exec(message)?.[1]
  if (code === 'ref_not_found' || GIT_REF_NOT_FOUND_RE.test(message)) return 'ref_not_found'
  if (code === 'invalid_ref') return 'invalid_ref'
  if (code === 'no_daemon_available') return 'no_server'
  if (code === 'timeout') return 'timeout'
  return 'other'
}

export type RepositoryReadNotice = Readonly<{ title: string; body: string }>

/** Said after every branch notice: Continue stays allowed, so say what that means. */
const BRANCH_MISSING_CONSEQUENCE =
  'You can still continue, but deploys will fail until a branch with that name exists.'

/** Said where the form below the notice really can still be filled in. */
const CONFIGURE_BELOW = 'You can still configure it below.'

function leaveEmptyAdvice(defaultBranch: string | null | undefined): string {
  return defaultBranch
    ? `Check the name, or leave it empty to use the default branch (${defaultBranch}).`
    : 'Check the name. This repository records no default branch, so name one that exists.'
}

function refNotFoundNotice(
  ref: string,
  repositoryName: string,
  defaultBranch: string | null | undefined,
): RepositoryReadNotice {
  // An empty field reads the default branch, so the missing name is that one
  // and "leave it empty" would be advice to do what was just done.
  if (ref.length === 0) {
    return {
      title: 'Branch not found',
      body: defaultBranch
        ? `The default branch (${defaultBranch}) does not exist in ${repositoryName}. Name the branch to deploy. ${BRANCH_MISSING_CONSEQUENCE}`
        : `The default branch does not exist in ${repositoryName}. Name the branch to deploy.`,
    }
  }
  return {
    title: 'Branch not found',
    body: `There's no branch called "${ref}" in ${repositoryName}. ${leaveEmptyAdvice(defaultBranch)} ${BRANCH_MISSING_CONSEQUENCE}`,
  }
}

/**
 * The notice the repository step shows when the read failed, or null when it
 * did not. Every sentence is fixed here; none of the server's text is used.
 */
export function repositoryReadNotice(
  err: unknown,
  context: Readonly<{
    /** The branch the read asked for (the settled field value, trimmed). */
    ref: string
    /** `owner/name`, as the picked-repository card shows it. */
    repositoryName: string
    defaultBranch: string | null | undefined
  }>,
): RepositoryReadNotice | null {
  if (err == null) return null
  switch (classifyRepositoryReadError(err)) {
    case 'ref_not_found':
      return refNotFoundNotice(context.ref, context.repositoryName, context.defaultBranch)
    case 'invalid_ref':
      return {
        title: 'Not a valid branch name',
        body: `"${context.ref}" can't be a git branch name: branch names have no spaces, no "..", and none of ~ ^ : ? * [ or a backslash. ${leaveEmptyAdvice(context.defaultBranch)}`,
      }
    case 'no_server':
      return {
        title: 'Could not read the repository',
        body: `This repository can only be read through a connected server, and none is connected right now. ${CONFIGURE_BELOW}`,
      }
    case 'timeout':
      return {
        title: 'Could not read the repository',
        body: `Reading the repository took too long. Try again in a moment. ${CONFIGURE_BELOW}`,
      }
    case 'unreachable':
      return {
        title: 'Could not read the repository',
        body: `${CONTROL_PLANE_UNREACHABLE_COPY} ${CONFIGURE_BELOW}`,
      }
    default:
      return {
        title: 'Could not read the repository',
        body: `${apiErrorCopy(err) ?? 'TurboPanel could not read this repository right now.'} ${CONFIGURE_BELOW}`,
      }
  }
}
