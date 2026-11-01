import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  ButtonRow,
  ConfirmButton,
  FingerprintLine,
  InlineNotice,
  LoadingState,
  SectionPanel,
  TextField,
} from '@/components/ui'
import { SuperadminOnly } from '@/components/admin/access/superadmin-only'
import { useAuth } from '@/lib/auth-context'
import type { InstanceIdentity } from '@/lib/instance-api'
import { COMPARE_KEY_HELP, NEXT_KEY_HELP, isPanelFingerprint } from '@/lib/panel-identity'
import { useInstanceIdentity, useSaveInstanceIdentityNext } from '@/lib/queries/admin'
import { colors, spacing } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

function IdentityDetails({ identity }: Readonly<{ identity: InstanceIdentity }>) {
  return (
    <View style={styles.details}>
      <FingerprintLine label="Current Key" value={identity.current?.fingerprint} />
      <FingerprintLine label="Next Key" value={identity.next?.fingerprint} />
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

function NextKeyEditor({ current }: Readonly<{ current: InstanceIdentity['next'] }>) {
  const mutation = useSaveInstanceIdentityNext()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const trimmed = value.trim()
  const valid = isPanelFingerprint(trimmed)

  const onSave = async (fingerprint: string | null) => {
    setError(null)
    setNotice(null)
    const result = await mutation.run(fingerprint)
    if (!result.ok) {
      setError(result.error ?? 'Failed to change the next key')
      return
    }
    setValue('')
    setNotice(fingerprint ? 'Next key saved.' : 'Next key cleared.')
  }

  return (
    <SectionPanel title="Change Next Key" hint="Superadmin only">
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.saved}>{notice}</Text> : null}
      <TextField
        label="Next Key Fingerprint"
        hint={NEXT_KEY_HELP}
        value={value}
        onChangeText={(next) => {
          setValue(next)
          setNotice(null)
          setError(null)
        }}
        mono
        autoCapitalize="none"
        autoCorrect={false}
        editable={!mutation.isPending}
        error={trimmed !== '' && !valid ? 'A fingerprint is 43 characters.' : undefined}
      />
      <ButtonRow>
        <ConfirmButton
          stacked
          variant="secondary"
          label="Save Next Key"
          confirmLabel="Save"
          prompt="Servers will accept this key after a rotation. Save it?"
          busy={mutation.isPending}
          disabled={!valid || mutation.isPending}
          onConfirm={() => {
            void onSave(trimmed)
          }}
        />
        {current ? (
          <ConfirmButton
            stacked
            label="Clear Next Key"
            confirmLabel="Clear"
            prompt="Servers will have no key to move to. Clear it?"
            busy={mutation.isPending}
            disabled={mutation.isPending}
            onConfirm={() => {
              void onSave(null)
            }}
          />
        ) : null}
      </ButtonRow>
    </SectionPanel>
  )
}

export function PanelIdentitySection() {
  const { controlPlaneRuntime } = useAuth()
  const query = useInstanceIdentity()
  const identity = query.data

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Panel Identity</Text>
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
          title="Panel identity is off"
          body="Set the TURBOPANEL_IDENTITY_KEYS secret (High Availability) or start the control plane once (self-hosted) to create it."
        />
      ) : null}
      {identity?.configured ? (
        <>
          <SectionPanel title="Keys" hint="Public fingerprints only; no private key is shown">
            <IdentityDetails identity={identity} />
          </SectionPanel>
          {controlPlaneRuntime === 'workers' ? null : (
            <SuperadminOnly title="Change Next Key">
              <NextKeyEditor current={identity.next} />
            </SuperadminOnly>
          )}
        </>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { width: '100%', gap: spacing.lg },
  details: { gap: spacing.md },
  saved: { color: colors.ok, fontSize: 13, fontWeight: '600', lineHeight: 18 },
})
