import { Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { LoadingState, TextLink } from '@/components/ui'
import { ServiceRuntimeLogPanel } from '@/components/logs/service-runtime-log'
import { NodeSettingsPanel } from '@/components/org/node-settings-panel'
import { ServiceSettingsPanel } from '@/components/org/service-settings-panel'
import { ServiceReleasesPanel } from '@/components/org/project/service-releases-panel'
import { panelStyles } from '@/components/ui/panel-styles'
import { Section } from '@/components/ui/v4/section'
import { useProjectContext } from '@/components/org/project/project-context'
import {
  projectComposeEditHref,
  projectEnvironmentConfigurationHref,
  projectOverviewHref,
  serviceEnvironmentHref,
  withCarriedQuery,
} from '@/lib/project-navigation'
import { useServices, useServicesByEnvironments } from '@/lib/queries/services'
import { environmentDisplayName } from '@/lib/resource-labels'
import { spacing } from '@/lib/theme'

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

/**
 * One service inside its environment
 * (`/environments/:environmentId/services/:serviceId`). The environment
 * layout keeps the header, Deploy and the tab bar with Services lit; this page
 * adds the way back to the environment's services and a link to the Base,
 * where the defaults every environment shares are edited.
 */
export function EnvironmentServiceScreen() {
  const { serviceId: rawServiceId } = useLocalSearchParams<{
    serviceId: string | string[]
  }>()
  const serviceId = firstParam(rawServiceId)
  const router = useRouter()
  const {
    orgId,
    projectId,
    pathEnvironmentId,
    selectedEnvironment,
    canManage,
    isSystemProject,
    projectAllowsMutations,
  } = useProjectContext()
  const environmentId = pathEnvironmentId ?? ''
  const servicesQuery = useServices(orgId, environmentId, {
    enabled: !isSystemProject && environmentId !== '' && serviceId !== '',
  })

  if (isSystemProject || environmentId === '') {
    return <Redirect href={projectOverviewHref(orgId, projectId) as Href} />
  }

  const envName = environmentDisplayName(selectedEnvironment ?? {})
  const service = servicesQuery.data?.services.find((row) => row.id === serviceId) ?? null
  const manage = canManage && projectAllowsMutations
  const header = (
    <View style={styles.lead}>
      <TextLink
        label={`‹ ${envName}`}
        accessibilityLabel={`Back to the services in ${envName}`}
        // Navigate, not push: on a phone this returns to the Services screen
        // already in the stack, so the system back gesture does not loop.
        onPress={() =>
          router.navigate(
            projectEnvironmentConfigurationHref(orgId, projectId, environmentId) as Href
          )
        }
      />
      <View style={styles.scopeLine}>
        <Text style={panelStyles.muted}>{`Changes here apply to ${envName} only.`}</Text>
        <TextLink
          label="Edit the Base"
          size="sm"
          accessibilityLabel="Edit the defaults every environment shares, in the Base"
          onPress={() =>
            router.push(projectComposeEditHref(orgId, projectId, { view: 'visual' }) as Href)
          }
        />
      </View>
    </View>
  )

  if (servicesQuery.isLoading) {
    return (
      <View style={styles.screen}>
        {header}
        <LoadingState label="Loading service…" />
      </View>
    )
  }
  if (!service) {
    return (
      <View style={styles.screen}>
        {header}
        <Text style={panelStyles.muted}>{`Service not found in ${envName}.`}</Text>
      </View>
    )
  }

  const composeName = service.composeServiceName ?? 'service'
  const name = service.name?.trim() || composeName
  return (
    <View style={styles.screen}>
      {header}
      {/* Renders only when the compose service is `serviceKind: node`. */}
      <NodeSettingsPanel
        orgId={orgId}
        projectId={projectId}
        environmentId={environmentId}
        service={service}
        canManage={manage}
      />
      <Section title={name} note="Per-service operational settings">
        <ServiceSettingsPanel
          orgId={orgId}
          composeServiceName={composeName}
          service={service}
          canManage={manage}
        />
      </Section>
      <ServiceRuntimeLogPanel orgId={orgId} serviceId={service.id} serviceName={name} />
      {/* Only Git-backed services have releases; the panel hides itself for the rest. */}
      <ServiceReleasesPanel
        orgId={orgId}
        environmentId={environmentId}
        composeServiceName={composeName}
        canManage={manage}
        hideWhenEmpty
      />
    </View>
  )
}

/**
 * The project-scope service path (`/services/:serviceId`): sends the service to
 * the environment that runs it, keeping the query. Older links and a
 * database's connected services land here.
 */
export function ProjectServiceRedirectScreen() {
  const params = useLocalSearchParams<Record<string, string | string[]>>()
  const serviceId = firstParam(params.serviceId)
  const { orgId, projectId, environments, selectedEnvironmentId, isSystemProject, loading } =
    useProjectContext()
  const environmentIds = useMemo(() => environments.map((env) => env.id), [environments])
  const { servicesByEnv, isLoading } = useServicesByEnvironments(orgId, environmentIds, {
    enabled: !isSystemProject && serviceId !== '',
  })

  if (isSystemProject) {
    return <Redirect href={projectOverviewHref(orgId, projectId) as Href} />
  }
  if (loading || isLoading) return <LoadingState label="Loading service…" />
  const target = serviceEnvironmentHref(
    orgId,
    projectId,
    serviceId,
    servicesByEnv,
    selectedEnvironmentId
  )
  if (target === null) return <Text style={panelStyles.muted}>Service not found.</Text>
  return (
    <Redirect
      href={withCarriedQuery(target, params, ['orgId', 'projectId', 'serviceId']) as Href}
    />
  )
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing.lg,
    minWidth: 0,
  },
  lead: {
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  scopeLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: spacing.sm,
  },
})
