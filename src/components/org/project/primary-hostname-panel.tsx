import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useProjectContext } from '@/components/org/project/project-context'
import { Button, SectionPanel } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  environmentSiteHostnames,
  primarySiteHostname,
  readPrimaryHostnameOption,
} from '@/lib/environment-status'
import type { EnvironmentRecord } from '@/lib/instance-api'
import { useUpdateEnvironment } from '@/lib/queries/environments'
import { useHostingsByServices, useServices } from '@/lib/queries/services'
import { colors, spacing } from '@/lib/theme'

/** The Primary badge on the primary hostname, "Make primary" on the others for a manager. */
function HostnameAction({
  hostname,
  primary,
  editable,
  saving,
  onMakePrimary,
}: Readonly<{
  hostname: string
  primary: boolean
  editable: boolean
  saving: string | null
  onMakePrimary: () => void
}>) {
  if (primary) {
    return (
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Primary hostname</Text>
      </View>
    )
  }
  if (!editable) return null
  return (
    <Button
      label="Make primary"
      accessibilityLabel={`Make ${hostname} the primary hostname`}
      size="sm"
      busy={saving === hostname}
      busyLabel="Saving…"
      disabled={saving !== null}
      onPress={onMakePrimary}
    />
  )
}

/**
 * Every public hostname of one environment, with the primary one badged and a
 * "Make primary" button on the others. The primary is what the header's Visit
 * button opens; it is kept in `environment.options.primaryHostname`.
 */
export function PrimaryHostnamePanel({
  environment,
}: Readonly<{ environment: EnvironmentRecord }>) {
  const { orgId, canManage, projectAllowsMutations } = useProjectContext()
  const servicesQuery = useServices(orgId, environment.id)
  const serviceIds = useMemo(
    () => (servicesQuery.data?.services ?? []).map((service) => service.id),
    [servicesQuery.data?.services]
  )
  const { hostingsByService } = useHostingsByServices(orgId, serviceIds, {
    enabled: serviceIds.length > 0,
  })
  const hostnames = useMemo(
    () => environmentSiteHostnames(hostingsByService, serviceIds),
    [hostingsByService, serviceIds]
  )
  const primary = primarySiteHostname(hostnames, readPrimaryHostnameOption(environment.options))
  const update = useUpdateEnvironment(orgId, environment.id)
  const [saving, setSaving] = useState<string | null>(null)
  const editable = canManage && projectAllowsMutations

  if (hostnames.length === 0) return null

  const makePrimary = async (hostname: string) => {
    setSaving(hostname)
    // `options` is replaced on save: send what is stored, with the new primary.
    await update.run({
      options: { ...environment.options, primaryHostname: hostname.toLowerCase() },
    })
    setSaving(null)
  }

  return (
    <SectionPanel title="Primary hostname" hint="Visit and status use the primary">
      <View style={styles.rows}>
        {hostnames.map((hostname) => (
          <View key={hostname} style={styles.row} accessibilityLabel={hostname}>
            <Text style={styles.hostname} numberOfLines={1}>
              {hostname}
            </Text>
            <HostnameAction
              hostname={hostname}
              primary={hostname === primary}
              editable={editable}
              saving={saving}
              onMakePrimary={() => {
                void makePrimary(hostname)
              }}
            />
          </View>
        ))}
      </View>
      {update.actionError ? <Text style={panelStyles.error}>{update.actionError}</Text> : null}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  rows: { gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    minHeight: 44,
  },
  hostname: {
    flexShrink: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderChip,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
})
