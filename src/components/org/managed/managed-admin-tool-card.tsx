import { useMemo } from 'react'
import { Linking, StyleSheet, Text, View } from 'react-native'
import {
  Badge,
  Button,
  ButtonRow,
  ConfirmButton,
  TextLink,
  TypeNameDeleteButton,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { confirmationName } from '@/lib/confirm-name'
import type { ManagedAdminToolRecord } from '@/lib/instance-api'
import { useLatestDeployments } from '@/lib/queries/environment-cards'
import {
  ADMIN_TOOL_REMOVE_NOTE,
  adminToolAccessLabel,
  adminToolDeployChip,
} from '@/lib/managed-admin-tools'
import { spacing } from '@/lib/theme'

/** The address the tool answers on. */
export function adminToolUrl(tool: Pick<ManagedAdminToolRecord, 'hostname'>): string {
  return `https://${tool.hostname}`
}

function openTool(url: string) {
  Linking.openURL(url).catch(() => {
    // The address is shown next to the button, so a refused open loses nothing.
  })
}

/** One admin tool of the cluster: its address, state and the four things to do with it. */
export function ManagedAdminToolCard({
  orgId,
  tool,
  disabled,
  onReset,
  onUpdate,
  onRemove,
}: Readonly<{
  orgId: string
  tool: ManagedAdminToolRecord
  disabled: boolean
  onReset: (tool: ManagedAdminToolRecord) => void
  onUpdate: (tool: ManagedAdminToolRecord) => void
  onRemove: (tool: ManagedAdminToolRecord, typedName: string) => Promise<void>
}>) {
  const environmentIds = useMemo(() => [tool.environmentId], [tool.environmentId])
  const { latest } = useLatestDeployments(orgId, environmentIds)
  const deployChip = adminToolDeployChip(latest[tool.environmentId])
  const url = adminToolUrl(tool)
  return (
    <View style={panelStyles.detailCard}>
      <Text style={panelStyles.detailTitle}>{tool.label}</Text>
      <TextLink
        label={url}
        onPress={() => openTool(url)}
        accessibilityLabel={`Open ${tool.label} at ${tool.hostname}`}
      />
      <View style={styles.chipRow}>
        <Badge label={adminToolAccessLabel(tool.access)} tone="info" />
        <Badge label={tool.loginName} tone="muted" />
        {deployChip ? <Badge label={deployChip.label} tone={deployChip.tone} /> : null}
        {tool.updateAvailable ? <Badge label="Update Available" tone="pending" /> : null}
      </View>
      <ButtonRow>
        <Button label="Open" size="sm" onPress={() => openTool(url)} />
        <ConfirmButton
          label="Reset Password"
          confirmLabel="Reset"
          prompt="Reset the password? The old one stops working."
          variant="secondary"
          disabled={disabled}
          onConfirm={() => onReset(tool)}
        />
        {tool.updateAvailable ? (
          <ConfirmButton
            label="Update Tool"
            confirmLabel="Update"
            prompt={`Update ${tool.label} to the newest version and deploy it?`}
            variant="secondary"
            disabled={disabled}
            onConfirm={() => onUpdate(tool)}
          />
        ) : null}
        <TypeNameDeleteButton
          label="Remove"
          thing="Admin Tool"
          name={confirmationName(tool.name, tool.projectId)}
          description={ADMIN_TOOL_REMOVE_NOTE}
          disabled={disabled}
          onConfirm={(typed) => onRemove(tool, typed)}
        />
      </ButtonRow>
    </View>
  )
}

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
})
