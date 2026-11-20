import { useRouter, type Href } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { StyleSheet, Text, View } from 'react-native'
import { OrganizationDeleteButton } from '@/components/org/organization-delete-button'
import { ButtonRow, SectionPanel } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { isAdminSession, useAuth } from '@/lib/auth-context'
import type { OrganizationRecord } from '@/lib/instance-api'
import { setActiveOrganizationId } from '@/lib/org-context'
import {
  defaultOrgDashboardHref,
  organizationsHref,
  replaceOrganization,
} from '@/lib/org-navigation'
import { ORGANIZATION_DELETE_COPY, nextOrganizationAfterDelete } from '@/lib/organization-delete'
import { useAdminOrganizations } from '@/lib/queries/admin'
import { useOrganizationRecord } from '@/lib/queries/auth'
import { queryKeys, useCan } from '@/lib/query-client'
import { spacing } from '@/lib/theme'

/**
 * Organization Settings > General: the danger section at the bottom. Shown to
 * the organization owner and to platform admins (`organization:own`), and
 * never for the root organization (a platform admin can tell from the admin
 * list; anyone else gets the control plane's 409 in plain words). After the
 * delete it switches to another organization the person belongs to, else the
 * organization picker.
 */
export function OrganizationDeleteSection({ orgId }: Readonly<{ orgId: string }>) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { session } = useAuth()
  const canOwn = useCan('organization', orgId, 'organization:own')
  const org = useOrganizationRecord(orgId)
  const admin = isAdminSession(session)
  const adminList = useAdminOrganizations({ enabled: admin && canOwn })
  const isRoot = adminList.data?.organizations.find((row) => row.id === orgId)?.isRoot === true

  if (!canOwn || isRoot) return null

  const onDeleted = (deletedId: string) => {
    const cached = queryClient.getQueryData<{ organizations: OrganizationRecord[] }>(
      queryKeys.auth.organizations
    )
    const next = nextOrganizationAfterDelete(cached?.organizations ?? [], deletedId)
    setActiveOrganizationId(next)
    if (next) {
      replaceOrganization(router, defaultOrgDashboardHref(next) as Href)
    } else {
      router.replace(organizationsHref() as Href)
    }
  }

  return (
    <View style={styles.root} accessibilityLabel="Danger zone">
      <Text style={panelStyles.detailTitle} accessibilityRole="header">
        Danger Zone
      </Text>
      <SectionPanel title="Delete Organization" hint="Owner and platform admins · permanent">
        <Text style={panelStyles.muted}>{ORGANIZATION_DELETE_COPY}</Text>
        <ButtonRow>
          <OrganizationDeleteButton
            orgId={orgId}
            orgName={org?.name ?? orgId}
            label="Delete Organization"
            disabled={!org}
            onDeleted={onDeleted}
          />
        </ButtonRow>
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { width: '100%', gap: spacing.sm },
})
