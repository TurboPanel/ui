import { useRouter, type Href } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DefaultEnvironmentSettingsSection } from '@/components/org/default-environment-settings-section'
import { Button, ButtonRow, SectionPanel, SettingRow, Toggle } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  fetchOrgProjectSettings,
  saveOrgProjectSettings,
  type OrgProjectSettings,
} from '@/lib/instance-api'
import { managedSettingsHref } from '@/lib/org-navigation'
import { CLOSED_PROJECT_FORM_SECTIONS } from '@/lib/org-project-settings'
import { useApiMutation, useCan, queryKeys } from '@/lib/query-client'
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
 * The two "open by default" switches for the new-project form. Each press
 * saves that switch alone; the toggle shows the new value while it saves and
 * falls back to the stored one if the save fails.
 */
function ProjectFormSettingsSection({ orgId }: Readonly<{ orgId: string }>) {
  const queryClient = useQueryClient()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const queryKey = queryKeys.org(orgId).settings.projectSettings
  const query = useQuery({
    queryKey,
    queryFn: () => fetchOrgProjectSettings(orgId),
    enabled: canManage,
  })
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<OrgProjectSettings>>({})
  const mutation = useApiMutation({
    mutationFn: (patch: Partial<OrgProjectSettings>) => saveOrgProjectSettings(orgId, patch),
    onSuccess: (data) => {
      setError(null)
      setDraft({})
      queryClient.setQueryData(queryKey, {
        openEnvironmentSectionByDefault: data.openEnvironmentSectionByDefault,
        openWorkspaceSectionByDefault: data.openWorkspaceSectionByDefault,
      })
    },
    onError: (err) => {
      setDraft({})
      setError(userErrorMessage(err, 'Failed to save the new project form settings'))
    },
  })
  const current = { ...CLOSED_PROJECT_FORM_SECTIONS, ...query.data, ...draft }

  if (!canManage) return null

  return (
    <SectionPanel title="New Project Form" hint="Applies to everyone in this organization">
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {query.isError && !error ? (
        <Text style={panelStyles.error}>
          {userErrorMessage(query.error, 'Failed to load the new project form settings')}
        </Text>
      ) : null}
      {SWITCHES.map(({ key, label, description }) => (
        <SettingRow key={key} label={label} description={description}>
          <Toggle
            value={current[key]}
            onValueChange={(next) => {
              setDraft((before) => ({ ...before, [key]: next }))
              mutation.mutate({ [key]: next })
            }}
            disabled={mutation.isPending || query.isLoading}
            accessibilityLabel={label}
          />
        </SettingRow>
      ))}
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
 * from. It replaced the Projects › Settings page in the sidebar.
 */
export function ProjectSettingsTab({ orgId }: Readonly<{ orgId: string }>) {
  return (
    <View style={styles.tab}>
      <Text style={panelStyles.muted}>
        Defaults applied when new projects are created. Existing projects keep their current
        environments and names.
      </Text>
      <ProjectFormSettingsSection orgId={orgId} />
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
