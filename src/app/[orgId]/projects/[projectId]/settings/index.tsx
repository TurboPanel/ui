import { ComposeSettingsHub } from '@/components/org/project/compose-tabs'
import { ManagedFocusTab } from '@/components/org/project/managed-focus-tab'
import { useProjectContext } from '@/components/org/project/project-context'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { SectionPanel } from '@/components/org/section-panel'
import {
  isManagedProject,
  projectSettingsSubHref,
} from '@/lib/project-navigation'
import { spacing } from '@/lib/theme'
import { Link, type Href } from 'expo-router'
import { Pressable, Text, View } from 'react-native'

export default function ProjectSettingsScreen() {
  const { orgId, projectId, project, canOwn } =
    useProjectContext()

  if (project && isManagedProject(project)) {
    return (
      <View style={{ gap: spacing.lg }}>
        <ManagedFocusTab focus="settings" />
        <SectionPanel title="Project" hint="Workspace and danger zone">
          <Link
            href={
              projectSettingsSubHref(
                orgId,
                projectId,
                'workspace',
              ) as Href
            }
            asChild
          >
            <Pressable style={webPointer} accessibilityRole="link">
              <Text style={orgPanelStyles.detailLine}>Workspace…</Text>
            </Pressable>
          </Link>
          {canOwn ? (
            <Link
              href={
                projectSettingsSubHref(
                  orgId,
                  projectId,
                  'danger',
                ) as Href
              }
              asChild
            >
              <Pressable style={webPointer} accessibilityRole="link">
                <Text style={orgPanelStyles.error}>Delete project…</Text>
              </Pressable>
            </Link>
          ) : null}
        </SectionPanel>
      </View>
    )
  }

  return <ComposeSettingsHub />
}
