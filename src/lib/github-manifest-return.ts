/**
 * Query string the manifest callback 302s back to the Git providers page with.
 *
 * GitHub lands the browser on the API; after the instance stores the App it
 * redirects here. Codes stay short and secret-free.
 */

function firstQueryValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

export type GithubManifestReturn = {
  created: boolean
  error: string | null
}

export function readGithubManifestReturn(params: {
  created?: string | string[]
  error?: string | string[]
}): GithubManifestReturn {
  const created = firstQueryValue(params.created)
  const error = firstQueryValue(params.error)
  return {
    created: created !== undefined && created.length > 0,
    error: error && error.length > 0 ? error : null,
  }
}

export function githubManifestReturnNotice(
  result: GithubManifestReturn,
): { tone: 'info' | 'warning'; title: string; body: string } | null {
  if (result.error) {
    return {
      tone: 'warning',
      title: 'GitHub App was not registered',
      body: githubManifestReturnErrorBody(result.error),
    }
  }
  if (result.created) {
    return {
      tone: 'info',
      title: 'GitHub App registered',
      body: 'The App is saved. Connect repositories from Sources.',
    }
  }
  return null
}

function githubManifestReturnErrorBody(code: string): string {
  switch (code) {
    case 'conversion_failed':
      return 'GitHub could not finish creating the App. Start Create a GitHub App again.'
    case 'state_invalid':
      return 'This create link expired. Start Create a GitHub App again.'
    case 'conflict':
      return 'An application with that GitHub App id is already registered.'
    case 'forbidden':
      return 'This create link belongs to a different organization.'
    case 'unavailable':
      return 'The control plane could not complete registration. Try again in a moment.'
    case 'invalid_request':
      return 'This page opened without a finished GitHub create. If an App is already listed below, it registered successfully.'
    default:
      return 'Registration did not finish. Start Create a GitHub App again.'
  }
}
