import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { InlineNotice, LoadingState, SectionPanel } from '@/components/ui'
import { FingerprintLine } from '@/components/ui/fingerprint-line'
import { SealedSecretsPanel } from '@/components/admin/access/sealed-secrets-panel'
import { SuperadminOnly } from '@/components/admin/access/superadmin-only'
import { isSuperadminSession, useAuth } from '@/lib/auth-context'
import { KeyRotationPanel } from '@/components/admin/access/key-rotation-panel'
import type { InstanceIdentity, KeysetChangeRequest } from '@/lib/instance-api'
import {
  COMPARE_KEY_HELP,
  OTHER_KEY_HELP,
  serversNotRotatable,
  serversPinnedToAnotherKey,
} from '@/lib/panel-identity'
import { useInstanceIdentity } from '@/lib/queries/admin'
import { spacing } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

function IdentityDetails({ identity }: Readonly<{ identity: InstanceIdentity }>) {
  return (
    <View style={styles.details}>
      <FingerprintLine label="Current Key" value={identity.current?.fingerprint} />
      <FingerprintLine
        label="Key Set"
        value={identity.current ? String(identity.current.keyset) : null}
        copy={false}
      />
      <FingerprintLine label="Sealing Key" value={identity.seal?.fingerprint} />
      <FingerprintLine label="Install Address" value={identity.installUrl} copy={false} />
      <Text style={panelStyles.muted}>{COMPARE_KEY_HELP}</Text>
    </View>
  )
}

export function PanelIdentitySection({
  linkRequest = null,
}: Readonly<{ linkRequest?: KeysetChangeRequest | null }> = {}) {
  const { session } = useAuth()
  const query = useInstanceIdentity()
  const identity = query.data
  const otherKey = identity ? serversPinnedToAnotherKey(identity.servers ?? []) : []

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Control Plane Identity</Text>
      <Text style={panelStyles.pageCopy}>
        The keys this control plane signs with. Servers pin the current key when they are installed.
      </Text>
      {query.isLoading ? <LoadingState /> : null}
      {query.isError ? (
        <Text style={panelStyles.error}>
          {userErrorMessage(query.error, 'Failed to load the control plane keys')}
        </Text>
      ) : null}
      {identity?.configured === false ? (
        <InlineNotice
          title="Control plane identity is off"
          body="Set the TURBOPANEL_IDENTITY_KEYS secret (High Availability) or start the control plane once (self-hosted) to create it."
        />
      ) : null}
      {identity?.configured && otherKey.length > 0 ? (
        <InlineNotice
          tone="warning"
          title="Servers Pinned to Another Key"
          body={`${otherKey.join(', ')}. ${OTHER_KEY_HELP}`}
        />
      ) : null}
      {identity?.configured ? (
        <>
          <SectionPanel title="Keys" hint="Public fingerprints only; no private key is shown">
            <IdentityDetails identity={identity} />
          </SectionPanel>
          <SuperadminOnly title="Rotation Passkeys">
            <KeyRotationPanel
              linkRequest={linkRequest}
              notRotatable={serversNotRotatable(identity.servers ?? [])}
            />
          </SuperadminOnly>
          {isSuperadminSession(session) ? <SealedSecretsPanel /> : null}
        </>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { width: '100%', gap: spacing.lg },
  details: { gap: spacing.md },
})
