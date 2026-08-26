/**
 * Hand a GitHub App manifest to GitHub.
 *
 * **This has to be a form POST, not a navigation.** GitHub's manifest flow
 * reads the App definition from a `manifest` form field on a POST to
 * `…/settings/apps/new`; a GET there just renders the ordinary blank
 * App-creation page, no conversion `code` is ever issued, and the callback that
 * stores the credentials never runs. So `Linking.openURL` is not an option
 * here, unlike every other provider redirect in this codebase.
 *
 * Web-only by nature — it needs a real form in a real document. Native callers
 * get `false` back and should tell the operator to use the browser, rather than
 * opening a page that silently does the wrong thing.
 */
export function submitGithubAppManifest(
  createUrl: string,
  manifest: Record<string, unknown>,
): boolean {
  if (typeof document === 'undefined') return false

  const form = document.createElement('form')
  form.method = 'POST'
  form.action = createUrl
  // The operator has to *land* on GitHub to approve the App, so this replaces
  // the current page rather than opening a background request.
  form.style.display = 'none'

  const field = document.createElement('input')
  field.type = 'hidden'
  field.name = 'manifest'
  field.value = JSON.stringify(manifest)
  form.appendChild(field)

  document.body.appendChild(form)
  form.submit()
  form.remove()
  return true
}

/** What to tell an operator whose platform cannot submit the form. */
export const MANIFEST_WEB_ONLY_NOTE =
  'Creating a GitHub App has to happen in a web browser — GitHub needs the ' +
  'app definition posted as a form. Open TurboPanel in a browser and try ' +
  'again, or register an existing App by hand here.'
