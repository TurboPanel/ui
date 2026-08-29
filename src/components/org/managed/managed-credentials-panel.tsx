import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SecretReveal } from '@/components/org/managed/secret-reveal'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, SectionPanel } from '@/components/ui'
import type {
  BindingImpactService,
  BindingRedeployRequired,
} from '@/lib/instance-api'
import { managedErrorMessage } from '@/lib/managed-services'
import { colors, spacing } from '@/lib/theme'

export function ManagedCredentialsPanel({
  rootUsername,
  canManage,
  busy,
  onRotate,
  onRedeployService,
}: Readonly<{
  orgId?: string
  rootUsername: string | null
  canManage: boolean
  busy: boolean
  onRotate: () => Promise<{
    rootPassword: string
    redeployRequired?: BindingRedeployRequired
  } | null>
  onRedeployService?: (environmentId: string) => Promise<void>
}>) {
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null)
  const [redeployRequired, setRedeployRequired] =
    useState<BindingRedeployRequired | null>(null)
  const [rotating, setRotating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [redeployBusy, setRedeployBusy] = useState<string | null>(null)

  const handleRotate = async () => {
    setRotating(true)
    setError(null)
    try {
      const result = await onRotate()
      if (result?.rootPassword) {
        setRevealedPassword(result.rootPassword)
        if (result.redeployRequired && result.redeployRequired.count > 0) {
          setRedeployRequired(result.redeployRequired)
        }
      }
    } catch (err) {
      setError(managedErrorMessage(err, 'Failed to rotate password'))
    } finally {
      setRotating(false)
    }
  }

  if (revealedPassword) {
    return (
      <SectionPanel title="Credentials" hint="Root database user" accent>
        <SecretReveal
          username={rootUsername}
          password={revealedPassword}
          onContinue={() => setRevealedPassword(null)}
          continueLabel="Done"
        />
        {redeployRequired && onRedeployService ? (
          <View style={styles.redeployCard}>
            <Text style={panelStyles.detailTitle}>
              {redeployRequired.count} service(s) need a redeploy to pick up the
              new password
            </Text>
            {redeployRequired.services.map((service: BindingImpactService) => (
              <View key={service.serviceId} style={styles.redeployRow}>
                <Text style={styles.serviceLabel}>
                  {service.name?.trim() || service.keyPrefix}
                </Text>
                <Button
                  label={
                    redeployBusy === service.serviceId
                      ? 'Redeploying…'
                      : 'Redeploy'
                  }
                  size="sm"
                  busy={redeployBusy === service.serviceId}
                  onPress={() => {
                    setRedeployBusy(service.serviceId)
                    void onRedeployService(service.environmentId).finally(() =>
                      setRedeployBusy(null),
                    )
                  }}
                />
              </View>
            ))}
            <Button label="Done" onPress={() => setRedeployRequired(null)} />
          </View>
        ) : null}
      </SectionPanel>
    )
  }

  return (
    <SectionPanel title="Credentials" hint="Root database user" accent>
      <View style={panelStyles.detailCard}>
        <Text style={panelStyles.detailLine}>
          <Text style={panelStyles.detailLabel}>Root username: </Text>
          {rootUsername ?? '—'}
        </Text>
        <Text style={panelStyles.muted}>
          Passwords are never shown again after you dismiss the reveal.
        </Text>
        {error ? <Text style={panelStyles.error}>{error}</Text> : null}
        {canManage ? (
          <Button
            label="Rotate password"
            busyLabel="Rotating…"
            busy={rotating}
            disabled={busy}
            onPress={() => {
              void handleRotate()
            }}
          />
        ) : null}
      </View>
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  redeployCard: {
    marginTop: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 8,
    padding: spacing.sm,
  },
  redeployRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  serviceLabel: {
    color: colors.text,
    fontSize: 13,
  },
})
