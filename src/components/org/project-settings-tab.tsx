import { useRouter, type Href } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DefaultEnvironmentSettingsSection } from '@/components/org/default-environment-settings-section'
import { Button, ButtonRow, LoadingState, SectionPanel, SettingRow, Toggle } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  fetchOrgProjectSettings,
  saveOrgProjectSettings,
  type OrgProjectSettings,
} from '@/lib/instance-api'
import { managedSettingsHref } from '@/lib/org-navigation'
import { CLOSED_PROJECT_FORM_SECTIONS } from '@/lib/org-project-settings'
import { useApiMutation, useCanState, queryKeys } from '@/lib/query-client'
import { spacing } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

type ProjectFormSwitch = keyof OrgProjectSettings

const SWITCHES: readonly { key: ProjectFormSwitch; label: string; description: string }[] = [
  {
    key: 'openEnvironmentSectionByDefault',
    label: 'Open the Environment section by default',
    description:
      'Off by default. Most projects have a single environment, so its name stays tucked away until someone opens it. Turn this on if your team usually names environments when it sets up a project.',
  },
  {
    key: 'openWorkspaceSectionByDefault',
    label: 'Open the Workspace section by default',
    description:
      'Off by default. New projects go into the workspace already picked, so nobody has to think about it. Turn this on if your team sorts projects into several workspaces.',
  },
]

/**
 * One "open by default" switch. Each switch saves on its own, so pressing the
 * second while the first is still saving is never dropped. The toggle shows
 * the new value while it saves and falls back to the stored one on failure.
 */
function ProjectFormSwitchRow({
  orgId,
  switchKey,
  label,
  description,
  stored,
  loading,
  onError,
}: Readonly<{
  orgId: string
  switchKey: ProjectFormSwitch
  label: string
  description: string
  stored: boolean
  loading: boolean
  onError: (message: string | null) => void
}>) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<boolean | null>(null)
  const mutation = useApiMutation({
    mutationFn: (next: boolean) => saveOrgProjectSettings(orgId, { [switchKey]: next }),
    onSuccess: (data) => {
      onError(null)
      setDraft(null)
      const keys = queryKeys.org(orgId).settings
      for (const key of [keys.projectSettings, keys.projectFormDefaults]) {
        queryClient.setQueryData<OrgProjectSettings>(key, (before) => ({
          ...CLOSED_PROJECT_FORM_SECTIONS,
          ...before,
          [switchKey]: data[switchKey],
        }))
      }
    },
    onError: (err) => {
      setDraft(null)
      onError(userErrorMessage(err, 'Failed to save the new project form settings'))
    },
  })
  return (
    <SettingRow label={label} description={description}>
      <Toggle
        value={draft ?? stored}
        onValueChange={(next) => {
          setDraft(next)
          mutation.mutate(next)
        }}
        disabled={mutation.isPending || loading}
        accessibilityLabel={label}
      />
    </SettingRow>
  )
}

/** The two "open by default" switches for the new-project form. */
function ProjectFormSettingsSection({
  orgId,
  permissionLoading,
}: Readonly<{ orgId: string; permissionLoading: boolean }>) {
  const query = useQuery({
    queryKey: queryKeys.org(orgId).settings.projectSettings,
    queryFn: () => fetchOrgProjectSettings(orgId),
    enabled: !permissionLoading,
  })
  const [error, setError] = useState<string | null>(null)
  const stored = { ...CLOSED_PROJECT_FORM_SECTIONS, ...query.data }
  const loading = permissionLoading || query.isLoading

  return (
    <SectionPanel title="New Project Form" hint="Applies to everyone in this organization">
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {query.isError && !error ? (
        <Text style={panelStyles.error}>
          {userErrorMessage(query.error, 'Failed to load the new project form settings')}
        </Text>
      ) : null}
      {loading ? (
        <LoadingState />
      ) : (
        SWITCHES.map(({ key, label, description }) => (
          <ProjectFormSwitchRow
            key={key}
            orgId={orgId}
            switchKey={key}
            label={label}
            description={description}
            stored={stored[key]}
            loading={loading}
            onError={setError}
          />
        ))
      )}
    </SectionPanel>
  )
}

/** Managed databases keep their own settings page; this tab only points at it. */
function ManagedDatabasesLinkSection({ orgId }: Readonly<{ orgId: string }>) {
  const router = useRouter()
  return (
    <SectionPanel
      title="Managed Databases"
      hint="The organization defaults every managed database inherits"
    >
      <ButtonRow>
        <Button
          label="Managed Database Settings"
          size="sm"
          onPress={() => router.push(managedSettingsHref(orgId) as Href)}
        />
      </ButtonRow>
    </SectionPanel>
  )
}

/**
 * Organization Settings › Project Settings: the defaults new projects start
 * from. It replaced the Projects › Settings page in the sidebar. Only owners
 * and managers can change these, so everyone else gets one line saying so
 * instead of panels and links that would open empty.
 */
export function ProjectSettingsTab({ orgId }: Readonly<{ orgId: string }>) {
  const manage = useCanState('organization', orgId, 'organization:manage')
  const intro = (
    <Text style={panelStyles.muted}>
      Defaults applied when new projects are created. Existing projects keep their current
      environments and names.
    </Text>
  )
  if (!manage.loading && !manage.allowed) {
    return (
      <View style={styles.tab}>
        {intro}
        <Text style={panelStyles.muted}>
          Only organization owners and managers can change project settings.
        </Text>
      </View>
    )
  }
  return (
    <View style={styles.tab}>
      {intro}
      <ProjectFormSettingsSection orgId={orgId} permissionLoading={manage.loading} />
      <DefaultEnvironmentSettingsSection orgId={orgId} />
      <ManagedDatabasesLinkSection orgId={orgId} />
    </View>
  )
}

const styles = StyleSheet.create({
  tab: {
    width: '100%',
    gap: spacing.lg,
  },
})
