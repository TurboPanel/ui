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
 * The cache update after one switch saved: lay the saved value over what the
 * cache already holds. An entry that was never fetched stays empty (undefined
 * means "do not write"), because inventing one would store the other switch
 * as off until the cache went stale.
 */
export function overlaySavedSwitch(
  before: OrgProjectSettings | undefined,
  key: keyof OrgProjectSettings,
  value: boolean
): OrgProjectSettings | undefined {
  if (!before) return undefined
  return { ...before, [key]: value }
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
