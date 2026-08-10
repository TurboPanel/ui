import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SecretReveal } from '@/components/org/managed/secret-reveal'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
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
            <Text style={orgPanelStyles.detailTitle}>
              {redeployRequired.count} service(s) need a redeploy to pick up the
              new password
            </Text>
            {redeployRequired.services.map((service: BindingImpactService) => (
              <View key={service.serviceId} style={styles.redeployRow}>
                <Text style={styles.serviceLabel}>
                  {service.displayName?.trim() || service.keyPrefix}
                </Text>
                <Pressable
                  style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
                  disabled={redeployBusy === service.serviceId}
                  onPress={() => {
                    setRedeployBusy(service.serviceId)
                    void onRedeployService(service.environmentId).finally(() =>
                      setRedeployBusy(null),
                    )
                  }}
                >
                  <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
                    {redeployBusy === service.serviceId
                      ? 'Redeploying…'
                      : 'Redeploy'}
                  </Text>
                </Pressable>
              </View>
            ))}
            <Pressable
              style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
              onPress={() => setRedeployRequired(null)}
            >
              <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Done</Text>
            </Pressable>
          </View>
        ) : null}
      </SectionPanel>
    )
  }

  return (
    <SectionPanel title="Credentials" hint="Root database user" accent>
      <View style={orgPanelStyles.detailCard}>
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>Root username: </Text>
          {rootUsername ?? '—'}
        </Text>
        <Text style={orgPanelStyles.muted}>
          Passwords are never shown again after you dismiss the reveal.
        </Text>
        {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
        {canManage ? (
          <Pressable
            style={[
              orgPanelStyles.toolbarBtnSecondary,
              webPointer,
              (busy || rotating) && styles.disabled,
            ]}
            disabled={busy || rotating}
            onPress={() => {
              void handleRotate()
            }}
          >
            <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
              {rotating ? 'Rotating…' : 'Rotate password'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.55,
  },
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
