import { StyleSheet, Text, View } from 'react-native'
import { Checkbox, MonoText, TextField } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { EnvironmentDataVolumesResponse } from '@/lib/instance-api'
import {
  DESTROY_CONFIRM_NAME_LABEL,
  DESTROY_DELETE_VOLUMES_LABEL,
  DESTROY_KEPT_HEADING,
  DESTROY_NO_VOLUMES_COPY,
  DESTROY_VOLUMES_HEADING,
  destroyConfirmNameHint,
  destroyOutdatedServersCopy,
} from '@/lib/environment-menu'
import { colors, spacing } from '@/lib/theme'

/** The data volumes the choice would delete, and the ones it keeps. */
function DataVolumeList({ data }: Readonly<{ data: EnvironmentDataVolumesResponse }>) {
  return (
    <View style={styles.list}>
      {data.volumes.length === 0 ? (
        <Text style={styles.hint}>{DESTROY_NO_VOLUMES_COPY}</Text>
      ) : (
        <>
          <Text style={styles.hint}>{DESTROY_VOLUMES_HEADING}</Text>
          {data.volumes.map((volume) => (
            <MonoText key={volume.storageId} style={styles.item}>
              {volume.name}
            </MonoText>
          ))}
        </>
      )}
      {data.kept.length > 0 ? (
        <>
          <Text style={styles.hint}>{DESTROY_KEPT_HEADING}</Text>
          {data.kept.map((volume) => (
            <Text key={volume.storageId} style={styles.hint}>
              <MonoText style={styles.item}>{volume.name}</MonoText>
              {` ${volume.message}`}
            </Text>
          ))}
        </>
      ) : null}
    </View>
  )
}

/**
 * The armed Destroy's "Also Delete the Data Volumes": off each time Destroy is
 * armed. Ticked, it lists the volumes that go and asks for the environment
 * name typed exactly; the control plane checks the same name and recomputes
 * the list itself.
 */
export function DestroyDataChoice({
  checked,
  onToggle,
  typedName,
  onTypedName,
  expectedName,
  data,
  loading,
  error,
  disabled,
}: Readonly<{
  checked: boolean
  onToggle: () => void
  typedName: string
  onTypedName: (value: string) => void
  expectedName: string
  data: EnvironmentDataVolumesResponse | undefined
  loading: boolean
  error: string | null
  disabled: boolean
}>) {
  const outdated = destroyOutdatedServersCopy(
    data?.outdatedServers.map((server) => server.name) ?? []
  )
  return (
    <View style={styles.root}>
      <Checkbox
        checked={checked}
        onPress={onToggle}
        disabled={disabled}
        label={DESTROY_DELETE_VOLUMES_LABEL}
      />
      {checked ? (
        <View style={styles.body}>
          {loading ? <Text style={styles.hint}>Loading the volumes…</Text> : null}
          {error ? <Text style={panelStyles.error}>{error}</Text> : null}
          {data ? <DataVolumeList data={data} /> : null}
          {outdated ? <Text style={panelStyles.error}>{outdated}</Text> : null}
          <TextField
            label={DESTROY_CONFIRM_NAME_LABEL}
            hint={destroyConfirmNameHint(expectedName)}
            value={typedName}
            onChangeText={onTypedName}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!disabled}
            accessibilityLabel="Type the environment name to delete its data volumes"
          />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xs,
  },
  body: {
    gap: spacing.sm,
    paddingLeft: spacing.lg,
  },
  list: {
    gap: spacing.xs,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  item: {
    fontSize: 12,
  },
})
