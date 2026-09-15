import { useCallback, useState } from 'react'
import { Linking, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { StepUpPasswordField } from '@/components/account/step-up-password-field'
import {
  Badge,
  Button,
  ConfirmButton,
  DataTable,
  DataTableCell,
  DataTableEmpty,
  DataTableRow,
  InlineNotice,
  type DataTableColumn,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { usesSameOriginApi } from '@/lib/control-plane'
import {
  OAUTH_WEB_ONLY_NOTE,
  oauthStartUrl,
  type OAuthProvider,
} from '@/lib/instance-api'
import { useUnlinkProvider } from '@/lib/queries/auth'
import {
  optionalPassword,
  securityActionMessage,
  securityActionNeedsPassword,
  type SecurityActionResult,
} from '@/lib/security-actions'
import { SECURITY_STATUS_UNAVAILABLE } from '@/lib/security-display'
import { colors, spacing } from '@/lib/theme'

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'provider', header: 'Provider', flex: 2, minWidth: 140 },
  { key: 'status', header: 'Status', flex: 1, minWidth: 100 },
  { key: 'actions', header: '', width: 150, align: 'end' },
]

const PROVIDER_LABEL: Record<OAuthProvider, string> = {
  github: 'GitHub',
  google: 'Google',
}

const LAST_SIGN_IN_METHOD = 'last_sign_in_method'
const LAST_SIGN_IN_NOTE = 'Keep at least one way to sign in.'

function firstSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function unlinkResultMessage(result: SecurityActionResult): string | null {
  const message = securityActionMessage(result)
  if (message?.includes(LAST_SIGN_IN_METHOD)) return LAST_SIGN_IN_NOTE
  return message
}

function uniqueProviderRows(
  linkedProviders: readonly OAuthProvider[],
  authProviders: readonly OAuthProvider[],
): OAuthProvider[] {
  const rows: OAuthProvider[] = []
  const seen = new Set<OAuthProvider>()
  for (const provider of [...authProviders, ...linkedProviders]) {
    if (seen.has(provider)) continue
    seen.add(provider)
    rows.push(provider)
  }
  return rows
}

/**
 * Configured and already-linked OAuth providers for this instance. Rows are
 * the union of `linkedProviders` and `authProviders` so a linked identity
 * still appears after the provider is unconfigured. Link stays gated to
 * configured-but-unlinked providers; unlink is always offered for a linked
 * row (the control plane answers 409 `last_sign_in_method` when it is last).
 * Linked state comes from the two-factor status projection — there is no
 * separate OAuth list read.
 */
export function LinkedAccountsPanel({
  linkedProviders,
  authProviders,
  loading,
  unavailable = false,
}: Readonly<{
  linkedProviders: readonly OAuthProvider[]
  authProviders: readonly OAuthProvider[]
  loading: boolean
  unavailable?: boolean
}>) {
  const params = useLocalSearchParams<{
    linked?: string | string[]
    error?: string | string[]
  }>()
  const linkedReturn = firstSearchParam(params.linked)
  const returnError = firstSearchParam(params.error)
  const canLink = usesSameOriginApi()

  if (unavailable) {
    return (
      <View style={styles.stack}>
        <DataTable columns={COLUMNS} minWidth={420} bordered>
          <DataTableEmpty>{SECURITY_STATUS_UNAVAILABLE}</DataTableEmpty>
        </DataTable>
      </View>
    )
  }

  return (
    <View style={styles.stack}>
      {linkedReturn ? (
        <InlineNotice
          title="Account linked"
          body={`${PROVIDER_LABEL[linkedReturn as OAuthProvider] ?? 'That provider'} is now linked to this account.`}
        />
      ) : null}
      {returnError === 'account_conflict' ? (
        <InlineNotice
          tone="warning"
          title="Could not link that account"
          body="That provider account is already linked to a different user."
        />
      ) : null}
      {!canLink && authProviders.length > 0 ? (
        <InlineNotice title="Link from a browser" body={OAUTH_WEB_ONLY_NOTE} />
      ) : null}
      <Text style={panelStyles.muted}>
        Sign in with a provider you already use. Unlinking still needs a
        remaining password, passkey, or other provider.
      </Text>
      <ProviderList
        linkedProviders={linkedProviders}
        authProviders={authProviders}
        loading={loading}
        canLink={canLink}
      />
    </View>
  )
}

function ProviderList({
  linkedProviders,
  authProviders,
  loading,
  canLink,
}: Readonly<{
  linkedProviders: readonly OAuthProvider[]
  authProviders: readonly OAuthProvider[]
  loading: boolean
  canLink: boolean
}>) {
  const unlink = useUnlinkProvider()
  const [password, setPassword] = useState('')
  const [passwordRequired, setPasswordRequired] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [pendingProvider, setPendingProvider] = useState<OAuthProvider | null>(
    null,
  )
  const linkedSet = new Set(linkedProviders)
  const configuredSet = new Set(authProviders)
  const rows = uniqueProviderRows(linkedProviders, authProviders)

  const onUnlink = useCallback(
    (provider: OAuthProvider) => {
      setMessage(null)
      setPendingProvider(provider)
      unlink
        .run({ provider, password: optionalPassword(password) })
        .then((result) => {
          setPasswordRequired(securityActionNeedsPassword(result))
          setMessage(unlinkResultMessage(result))
          if (result.ok) setPassword('')
        })
        .catch(() => {
          // `run` folds rejections into its result shape.
        })
        .finally(() => {
          setPendingProvider(null)
        })
    },
    [password, unlink],
  )

  const onLink = useCallback((provider: OAuthProvider) => {
    void Linking.openURL(oauthStartUrl(provider, { link: true }))
  }, [])

  let body = null
  if (loading) {
    body = <DataTableEmpty>Loading linked accounts…</DataTableEmpty>
  } else if (rows.length === 0) {
    body = (
      <DataTableEmpty>
        No sign-in providers are configured on this instance.
      </DataTableEmpty>
    )
  } else {
    body = rows.map((provider, index) => {
      const linked = linkedSet.has(provider)
      let action = null
      if (linked) {
        action = (
          <ConfirmButton
            label="Unlink"
            confirmLabel="Unlink"
            prompt="Unlink?"
            busy={unlink.isPending && pendingProvider === provider}
            onConfirm={() => onUnlink(provider)}
          />
        )
      } else if (canLink && configuredSet.has(provider)) {
        action = (
          <Button
            label="Link"
            size="sm"
            onPress={() => onLink(provider)}
          />
        )
      }
      return (
        <DataTableRow
          key={provider}
          alt={index % 2 === 1}
          last={index === rows.length - 1}
        >
          <DataTableCell column={COLUMNS[0]}>
            <Text style={styles.name}>{PROVIDER_LABEL[provider]}</Text>
          </DataTableCell>
          <DataTableCell column={COLUMNS[1]}>
            {linked ? <Badge tone="ok" label="Linked" /> : null}
          </DataTableCell>
          <DataTableCell column={COLUMNS[2]}>{action}</DataTableCell>
        </DataTableRow>
      )
    })
  }

  const showPassword = rows.some((provider) => linkedSet.has(provider))

  return (
    <View style={styles.stack}>
      <DataTable columns={COLUMNS} minWidth={420} bordered>
        {body}
      </DataTable>
      {showPassword ? (
        <StepUpPasswordField
          value={password}
          onChangeText={setPassword}
          editable={!unlink.isPending}
          required={passwordRequired}
        />
      ) : null}
      {message ? <Text style={panelStyles.error}>{message}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  name: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
})
