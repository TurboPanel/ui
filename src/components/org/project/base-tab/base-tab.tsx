import { useRouter, type Href } from 'expo-router'
import { useMemo } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { BaseEnvironmentsSection } from '@/components/org/project/base-tab/base-environments-section'
import { BaseLinuxUsersSection } from '@/components/org/project/base-tab/base-linux-users-section'
import { BaseMapSection } from '@/components/org/project/base-tab/base-map-section'
import { BaseServicesSection } from '@/components/org/project/base-tab/base-services-section'
import { BaseVariablesSection } from '@/components/org/project/base-tab/base-variables-section'
import { useBaseTabModel } from '@/components/org/project/base-tab/use-base-tab'
import { ProjectOverviewTab } from '@/components/org/project/project-overview-tab'
import { useProjectContext } from '@/components/org/project/project-context'
import { EmptyPanel } from '@/components/ui/v4/empty-panel'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { projectComposeHref } from '@/lib/project-navigation'
import { webPointer } from '@/lib/theme'
import {
  baseLinuxUserRows,
  baseServiceRows,
  baseVariableRows,
  type BaseEnvironment,
  type BaseEnvironmentRow,
} from '@/lib/v4/project-base'
import type {
  ConfigViewSide,
  EnvironmentConfigViewResponse,
  ProjectPrincipalRecord,
} from '@/lib/instance-api'

const styles = themedStyles((p) => ({
  page: { width: '100%', gap: 28 },
  loading: { alignItems: 'center', paddingVertical: 48 },
  expert: { ...typeStyle('body', 'footnote'), color: p.text3 },
  expertLink: { ...typeStyle('bodySemibold', 'footnote'), color: p.link },
  expertRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
}))

type ReadyProps = Readonly<{
  orgId: string
  projectId: string
  base: ConfigViewSide
  view: EnvironmentConfigViewResponse
  environments: readonly BaseEnvironment[]
  rows: readonly BaseEnvironmentRow[]
  principals: readonly ProjectPrincipalRecord[] | undefined
}>

/** The Base tab once the configuration is in: the map, then what the Base holds, then who it reaches. */
export function BaseTabBody({ orgId, projectId, base, view, environments, rows, principals }: ReadyProps) {
  const s = styles(usePalette())
  const router = useRouter()
  const services = useMemo(() => baseServiceRows(view, principals ?? []), [view, principals])
  const variables = useMemo(() => baseVariableRows(base), [base])
  const users = useMemo(
    () => baseLinuxUserRows(base, principals, environments),
    [base, principals, environments],
  )
  return (
    <View style={s.page}>
      <BaseMapSection view={view} environments={environments} principals={principals} />
      <BaseServicesSection rows={services} />
      <BaseVariablesSection rows={variables} />
      <BaseLinuxUsersSection rows={users} />
      <BaseEnvironmentsSection orgId={orgId} projectId={projectId} rows={rows} />
      <View style={s.expertRow}>
        <Text style={s.expert}>For experts:</Text>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="As Compose files (for experts)"
          onPress={() => router.push(projectComposeHref(orgId, projectId) as Href)}
          style={webPointer}
        >
          <Text style={s.expertLink}>As Compose files</Text>
        </Pressable>
      </View>
    </View>
  )
}

/**
 * The project's Base tab: the Base map with Compare-with, the services,
 * variables and Linux users the Base holds, and the environments built from
 * it. When no environment's configuration can be read (no manage access, or a
 * saved compose that does not parse) the screen that was here before stays.
 */
export function ProjectBaseTab() {
  const s = styles(usePalette())
  const { orgId, projectId } = useProjectContext()
  const model = useBaseTabModel()
  if (model.state === 'unavailable') return <ProjectOverviewTab />
  if (model.state === 'loading') {
    return (
      <View style={s.loading}>
        <ActivityIndicator accessibilityLabel="Loading the Base" />
      </View>
    )
  }
  if (model.state === 'empty') {
    return (
      <EmptyPanel
        title="No environments yet"
        body="The Base shows once the project has an environment. Add one on the Environments tab."
      />
    )
  }
  return (
    <BaseTabBody
      orgId={orgId}
      projectId={projectId}
      base={model.base}
      view={model.view}
      environments={model.environments}
      rows={model.rows}
      principals={model.principals}
    />
  )
}
