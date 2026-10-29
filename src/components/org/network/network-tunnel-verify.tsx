import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Badge, Button, ButtonRow, Checkbox, InlineNotice } from '@/components/ui'
import type { TunnelRecord } from '@/lib/instance-api'
import { useSetTunnelVerifyOrigin } from '@/lib/queries/tunnel-routes'
import { spacing } from '@/lib/theme'
import { tunnelErrorMessage } from '@/lib/tunnels'
import { verifyOriginSummary } from '@/lib/tunnel-runs'

/**
 * "Verify the connection to my server": the connector checks the certificate
 * of your web server instead of skipping the check. Each site gets a
 * certificate for exactly the names it serves; one wildcard certificate is a
 * separate, explicit choice. The check only starts once every hostname of the
 * tunnel has a site and a certificate, so a site that is not set up yet can
 * never make the tunnel unreachable.
 */
export function NetworkTunnelVerify({
  orgId,
  tunnel,
}: Readonly<{ orgId: string; tunnel: TunnelRecord }>) {
  const [open, setOpen] = useState(false)
  const [wildcard, setWildcard] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsDeploy, setNeedsDeploy] = useState(false)
  const set = useSetTunnelVerifyOrigin(orgId, tunnel.id)
  const summary = verifyOriginSummary(tunnel.verifyOrigin)
  const removing = tunnel.status === 'removing'

  async function apply(enabled: boolean) {
    setError(null)
    const result = await set.run({ enabled, wildcard: enabled && wildcard ? true : undefined })
    if (!result.ok) {
      setError(tunnelErrorMessage(result.cause, 'Failed to change the verified connection'))
      return
    }
    setNeedsDeploy(enabled && result.value.needsDeploy)
    setOpen(false)
  }

  return (
    <View style={styles.root}>
      <View style={styles.titleRow}>
        <Text style={panelStyles.detailTitle}>Verified Connection</Text>
        <Badge label={summary.label} tone={summary.tone} />
      </View>
      <Text style={panelStyles.muted}>{summary.line}</Text>
      {error ? (
        <Text style={panelStyles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {needsDeploy ? (
        <InlineNotice
          tone="warning"
          title="Deploy the sites again so their servers pick up the new certificate."
        />
      ) : null}
      {open ? (
        <View style={styles.form}>
          <Text style={panelStyles.muted}>
            Each site gets a certificate from Cloudflare for exactly the hostnames it serves. A site
            that also serves other names cannot use it, because browsers do not trust this
            certificate.
          </Text>
          <Checkbox
            checked={wildcard}
            onPress={() => setWildcard(!wildcard)}
            label="Use One Wildcard Certificate"
            disabled={set.isPending}
          />
          <Text style={panelStyles.muted}>
            A wildcard certificate covers every name one level below the zone, such as
            app.example.com but not a.app.example.com. Its key could impersonate any of those names,
            and revoking it affects every site that uses it. Leave this off unless you want that.
          </Text>
          <ButtonRow>
            <Button
              label="Turn On"
              variant="primary"
              size="sm"
              busy={set.isPending}
              onPress={() => void apply(true)}
              accessibilityLabel={`Turn on the verified connection for ${tunnel.name}`}
            />
            <Button
              label="Cancel"
              size="sm"
              disabled={set.isPending}
              onPress={() => {
                setOpen(false)
                setError(null)
              }}
            />
          </ButtonRow>
        </View>
      ) : (
        <ButtonRow>
          {tunnel.verifyOrigin.enabled ? (
            <>
              <Button
                label="Apply Again"
                size="sm"
                busy={set.isPending}
                disabled={removing}
                onPress={() => void apply(true)}
                accessibilityLabel={`Apply the verified connection again for ${tunnel.name}`}
              />
              <Button
                label="Turn Off"
                size="sm"
                busy={set.isPending}
                disabled={removing}
                onPress={() => void apply(false)}
                accessibilityLabel={`Turn off the verified connection for ${tunnel.name}`}
              />
            </>
          ) : (
            <Button
              label="Verify the Connection"
              size="sm"
              disabled={removing}
              onPress={() => setOpen(true)}
              accessibilityLabel={`Verify the connection for ${tunnel.name}`}
            />
          )}
        </ButtonRow>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  form: { gap: spacing.sm },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
})
