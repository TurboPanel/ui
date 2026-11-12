import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Badge, FormField, SegmentedControl, SettingRow, Toggle } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { FabricConfirmSheet } from '@/components/org/network/fabric-confirm-sheet'
import type { OrgFabricServerRecord, PatchOrgFabricServerBody } from '@/lib/instance-api'
import {
  FABRIC_ROLE_HELP,
  fabricMemberLabel,
  fabricRoleChoice,
  fabricRoleOptions,
  fabricRolePatch,
  fabricServerOffConfirm,
} from '@/lib/fabric-servers'
import { usePatchOrgFabricServer } from '@/lib/queries/fabric'
import { TURBOFABRIC_PRODUCT_NAME } from '@/lib/platform-copy'
import { spacing } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

/**
 * One server's TurboFabric switch and role picker, with the confirm step for
 * switching it off. Used on the organization TurboFabric page and on the
 * server's Network tab, so both write the same PATCH and show the same words.
 */
export function FabricServerControls({
  orgId,
  server,
  canManage,
  showName = false,
  showRoleHelp = true,
}: Readonly<{
  orgId: string
  server: OrgFabricServerRecord
  canManage: boolean
  /** Shows the server name as the row title (the organization list). */
  showName?: boolean
  /** The organization list shows the role help once above the rows. */
  showRoleHelp?: boolean
}>) {
  const patch = usePatchOrgFabricServer(orgId, server.serverId)
  const [error, setError] = useState<string | null>(null)
  const [confirmingOff, setConfirmingOff] = useState(false)
  const disabled = !canManage || patch.isPending
  const choice = fabricRoleChoice(server)

  function send(body: PatchOrgFabricServerBody, onDone?: () => void) {
    setError(null)
    patch.mutate(body, {
      onSuccess: () => onDone?.(),
      onError: (err) => {
        onDone?.()
        setError(
          userErrorMessage(
            err,
            `Failed to update this server's ${TURBOFABRIC_PRODUCT_NAME} settings`
          )
        )
      },
    })
  }

  return (
    <View style={styles.root}>
      {showName ? <Text style={panelStyles.detailTitle}>{server.name}</Text> : null}
      <SettingRow label={TURBOFABRIC_PRODUCT_NAME}>
        <Toggle
          value={server.enabled}
          disabled={disabled}
          busy={patch.isPending}
          accessibilityLabel={`${TURBOFABRIC_PRODUCT_NAME} on ${server.name}`}
          onValueChange={(next) => {
            if (next) send({ enabled: true })
            else setConfirmingOff(true)
          }}
        />
      </SettingRow>
      <View style={styles.badgeRow}>
        <Badge label={fabricMemberLabel(server.member)} tone={server.member ? 'ok' : 'muted'} />
      </View>
      <FormField label="Role">
        <SegmentedControl
          options={fabricRoleOptions(server.automaticRole)}
          value={choice}
          disabled={disabled}
          accessibilityLabel={`Role for ${server.name}`}
          onChange={(next) => {
            if (next !== choice) send({ role: fabricRolePatch(next) })
          }}
        />
      </FormField>
      {showRoleHelp ? <Text style={panelStyles.muted}>{FABRIC_ROLE_HELP}</Text> : null}
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      <FabricConfirmSheet
        copy={confirmingOff ? fabricServerOffConfirm(server.name) : null}
        busy={patch.isPending}
        onCancel={() => setConfirmingOff(false)}
        onConfirm={() => send({ enabled: false }, () => setConfirmingOff(false))}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
})
