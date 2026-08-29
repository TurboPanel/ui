import { Text, View } from 'react-native'
import { ManagedEnvironmentBody } from '@/components/org/managed/managed-project-section'
import { panelStyles } from '@/components/ui/panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
import { spacing } from '@/lib/theme'

export function ManagedFocusTab({
  focus,
}: Readonly<{
  focus: 'overview' | 'connect' | 'data' | 'backups' | 'settings' | 'environments'
}>) {
  const { orgId, project, selectedEnvironment } = useProjectContext()

  if (!project) return null
  if (!selectedEnvironment) {
    return <Text style={panelStyles.muted}>No environment selected.</Text>
  }

  return (
    <View style={{ width: '100%', gap: spacing.lg }}>
      <ManagedEnvironmentBody
        key={`${selectedEnvironment.id}-${focus}`}
        orgId={orgId}
        environmentId={selectedEnvironment.id}
        engineCode={project.metadata?.code ?? null}
        projectName={project.name?.trim() || 'Unnamed project'}
        focus={focus}
      />
    </View>
  )
}
