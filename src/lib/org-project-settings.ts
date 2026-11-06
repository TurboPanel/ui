import { useQuery } from '@tanstack/react-query'
import { fetchOrgProjectSettings, type OrgProjectSettings } from '@/lib/instance-api'
import { isForbiddenError, isHttpStatusError } from '@/lib/fetch-error-detail'
import { queryKeys } from '@/lib/query-keys'

/** Both sections closed: what an organization that never set the switches gets. */
export const CLOSED_PROJECT_FORM_SECTIONS: OrgProjectSettings = {
  openEnvironmentSectionByDefault: false,
  openWorkspaceSectionByDefault: false,
}

/**
 * The cache update after one switch saved. Over an entry the cache already
 * holds, only the saved switch changes, so a slower answer for the other
 * switch cannot undo a newer one. An entry that was never fetched (or whose
 * load failed) takes both values from the save's answer, which carries what is
 * stored now, so the switch just saved does not snap back and the other one
 * is never guessed.
 */
export function overlaySavedSwitch(
  before: OrgProjectSettings | undefined,
  key: keyof OrgProjectSettings,
  saved: OrgProjectSettings
): OrgProjectSettings {
  if (!before) {
    return {
      openEnvironmentSectionByDefault: saved.openEnvironmentSectionByDefault,
      openWorkspaceSectionByDefault: saved.openWorkspaceSectionByDefault,
    }
  }
  return { ...before, [key]: saved[key] }
}

/**
 * Whether a form section is open: a field error in it always opens it, then
 * the person's own choice, then the organization's default.
 */
export function projectFormSectionOpen(
  choice: boolean | null,
  openByDefault: boolean,
  hasError: boolean
): boolean {
  if (hasError) return true
  return choice ?? openByDefault
}

/**
 * The organization's "open by default" switches for the new-project form.
 *
 * Manage-gated like the primary environment name, so a 403 must not sign the
 * person out, and a control plane older than the route answers 404: both
 * read as "closed" inside the queryFn, so the global onError never sees them.
 * Its own query key keeps that fallback out of the settings tab's cache.
 */
export function useOrgProjectFormDefaults(orgId: string): OrgProjectSettings {
  const query = useQuery({
    queryKey: queryKeys.org(orgId).settings.projectFormDefaults,
    queryFn: async () => {
      try {
        return await fetchOrgProjectSettings(orgId)
      } catch (err) {
        if (isForbiddenError(err) || isHttpStatusError(err, 404)) {
          return CLOSED_PROJECT_FORM_SECTIONS
        }
        throw err
      }
    },
    retry: false,
    enabled: Boolean(orgId),
  })
  return query.data ?? CLOSED_PROJECT_FORM_SECTIONS
}
