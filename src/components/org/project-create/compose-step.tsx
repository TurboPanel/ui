import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import {
  ProjectProvider,
  type ProjectDraft,
} from '@/components/org/project/project-context'
import { ProjectOverviewTab } from '@/components/org/project/project-overview-tab'
import { ProjectShell } from '@/components/org/project/project-shell'
import { Button } from '@/components/ui'
import type { ComposeDocument, ProjectRecord } from '@/lib/instance-api'
import type { ComposeProjectTabId } from '@/lib/project-navigation'
import { layout, spacing } from '@/lib/theme'

/**
 * Id the draft surface runs under. Real ids are UUIDs, so this can never
 * collide; it only ever reaches query keys that are parked while a draft is
 * mounted, never the API.
 */
const DRAFT_PROJECT_ID = 'draft'

/**
 * Compose drafting step — the project's **own** screen, not a wizard-shaped
 * copy of it. Same shell, breadcrumb, width, and Overview · Compose · Services
 * tabs an existing compose project shows. The surface's Save is suppressed
 * because there is no row to patch; the footer's Create project button is the
 * single commit.
 */
export function ComposeStep({
  orgId,
  name,
  description,
  workspaceId,
  compose,
  initialSection,
  creating,
  error,
  onNameChange,
  onDraftChange,
  onCreate,
  onBack,
}: Readonly<{
  orgId: string
  name: string
  description: string
  /** Empty until the workspace is resolved at create time — display only. */
  workspaceId: string
  compose: ComposeDocument
  /** Tab this step opens on — Compose for the Compose card, Services for Services. */
  initialSection: ComposeProjectTabId
  creating: boolean
  error?: string | null
  onNameChange: (name: string) => void
  onDraftChange: (compose: ComposeDocument | null) => void
  onCreate: () => void
  onBack: () => void
}>) {
  const [section, setSection] =
    useState<ComposeProjectTabId>(initialSection)
  /** True while the editor's YAML will not parse — Create would ship stale text. */
  const [yamlBroken, setYamlBroken] = useState(false)

  const project = useMemo<ProjectRecord>(
    () => ({
      id: DRAFT_PROJECT_ID,
      name: name.trim() || null,
      description: description.trim() || null,
      workspaceId,
      metadata: { type: 'docker-compose' },
      options: { compose },
      // Timestamps are display-only here and nothing in the surface reads them
      // for a draft; the real values are assigned when the row is inserted.
      createdAt: '',
      updatedAt: '',
    }),
    [name, description, workspaceId, compose],
  )

  const draft = useMemo<ProjectDraft>(
    () => ({
      project,
      section,
      setSection,
      onProjectNameChange: onNameChange,
      onDraftChange: (next) => {
        setYamlBroken(next == null)
        onDraftChange(next)
      },
    }),
    [project, section, onNameChange, onDraftChange],
  )

  return (
    <View style={styles.root}>
      <ProjectProvider
        orgId={orgId}
        projectId={DRAFT_PROJECT_ID}
        draft={draft}
      >
        <ProjectShell>
          <ProjectOverviewTab />
        </ProjectShell>
      </ProjectProvider>

      <View style={styles.footer}>
        {error ? (
          <Text style={orgPanelStyles.error}>{error}</Text>
        ) : null}
        {yamlBroken ? (
          <Text style={orgPanelStyles.muted}>
            Fix the compose YAML before creating this project.
          </Text>
        ) : null}
        <View style={styles.footerRow}>
          <Button
            label="Back"
            variant="secondary"
            disabled={creating}
            onPress={onBack}
            accessibilityLabel="Back"
          />
          <Button
            label="Create project"
            busyLabel="Creating…"
            variant="primary"
            busy={creating}
            disabled={yamlBroken}
            onPress={onCreate}
            accessibilityLabel="Create project"
          />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.md,
  },
  // Match the shell's own content column so the actions line up with it.
  footer: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.xs,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
})
