import { Slot, useLocalSearchParams, Redirect, type Href } from 'expo-router'
import { ScrollView, StyleSheet } from 'react-native'
import { ProjectProvider } from '@/components/org/project/project-context'
import { ProjectShell } from '@/components/org/project/project-shell'
import { colors } from '@/lib/theme'

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

export default function ProjectLayout() {
  const { orgId, projectId } = useLocalSearchParams<{
    orgId: string
    projectId: string | string[]
  }>()
  const resolvedOrgId = firstParam(orgId)
  const resolvedProjectId = firstParam(projectId)

  if (!resolvedOrgId || !resolvedProjectId) {
    return <Redirect href={'/welcome' as Href} />
  }

  return (
    <ProjectProvider orgId={resolvedOrgId} projectId={resolvedProjectId}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <ProjectShell>
          <Slot />
        </ProjectShell>
      </ScrollView>
    </ProjectProvider>
  )
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flexGrow: 1,
    paddingVertical: 12,
  },
})
