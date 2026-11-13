import { StyleSheet, Text, View } from 'react-native'
import { PreviewWarnings } from '@/components/org/deploy-preview-panel'
import { panelStyles } from '@/components/ui/panel-styles'
import type {
  DeploySummary,
  DeploySummaryService,
  DeploySummaryServiceVariables,
  DeploySummaryUserVariable,
  DeploySummaryVariableGroup,
} from '@/lib/deploy-preview-summary'
import type { DeployPreviewResponse } from '@/lib/instance-api'
import { colors, spacing } from '@/lib/theme'

function ServiceRow({ service }: Readonly<{ service: DeploySummaryService }>) {
  const servers = service.servers.length > 0 ? service.servers.join(', ') : 'No server chosen yet'
  return (
    <View style={styles.row}>
      <Text style={styles.rowTitle}>
        <Text style={styles.serviceName}>{service.name}</Text>
        {`  ${service.kind} · ${servers}`}
      </Text>
      {service.origin ? <Text style={panelStyles.muted}>{service.origin}</Text> : null}
      {service.hostnames.map((hostname) => (
        <Text key={hostname.name} style={panelStyles.muted}>
          {hostname.tunnel ? `${hostname.name} (tunnel)` : hostname.name}
        </Text>
      ))}
    </View>
  )
}

function VariableGroup({ group }: Readonly<{ group: DeploySummaryVariableGroup }>) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{`Set by TurboPanel (${group.service})`}</Text>
      {group.variables.map((variable) => (
        <Text key={variable.name} style={panelStyles.muted}>
          <Text style={styles.serviceName}>
            {variable.value === null ? variable.name : `${variable.name} = ${variable.value}`}
          </Text>
          {`  ${variable.meaning}`}
        </Text>
      ))}
    </View>
  )
}

function userVariableLine(variable: DeploySummaryUserVariable): string {
  if (variable.secret || variable.value === null) return `${variable.name} = hidden (secret)`
  return `${variable.name} = ${variable.value}`
}

function UserVariableList({
  title,
  variables,
}: Readonly<{ title: string; variables: readonly DeploySummaryUserVariable[] }>) {
  if (variables.length === 0) return null
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {variables.map((variable) => (
        <Text key={variable.name} style={panelStyles.muted}>
          {userVariableLine(variable)}
        </Text>
      ))}
    </View>
  )
}

function ServiceVariables({ group }: Readonly<{ group: DeploySummaryServiceVariables }>) {
  return (
    <>
      <UserVariableList
        title={`Used While Building (${group.service})`}
        variables={group.building}
      />
      <UserVariableList title={`Used While Running (${group.service})`} variables={group.running} />
    </>
  )
}

/** The plain-words deploy summary: what runs where, and what TurboPanel sets. */
export function DeploySummaryView({
  summary,
  warnings,
}: Readonly<{
  summary: DeploySummary
  warnings: DeployPreviewResponse['warnings'] | undefined
}>) {
  return (
    <View style={styles.root}>
      <PreviewWarnings warnings={warnings} />
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>What Runs Where</Text>
        {summary.services.length === 0 ? (
          <Text style={panelStyles.muted}>No services to run yet.</Text>
        ) : (
          summary.services.map((service) => <ServiceRow key={service.name} service={service} />)
        )}
      </View>
      {summary.serviceVariables.map((group) => (
        <ServiceVariables key={group.service} group={group} />
      ))}
      {summary.variableGroups.map((group) => (
        <VariableGroup key={group.service} group={group} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  section: { gap: spacing.xs },
  sectionTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  row: { gap: 2 },
  rowTitle: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  serviceName: { color: colors.text, fontWeight: '600' },
})
