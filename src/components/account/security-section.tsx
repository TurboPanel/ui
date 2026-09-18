import { type ReactNode, useCallback, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { BackupCodesSheet } from '@/components/account/backup-codes-sheet'
import { LinkedAccountsPanel } from '@/components/account/linked-accounts-panel'
import { PasskeysPanel } from '@/components/account/passkeys-panel'
import { TotpEnrollFlow } from '@/components/account/totp-enroll-flow'
import { TwoFactorManage } from '@/components/account/two-factor-manage'
import { ScreenSafeArea } from '@/components/screen-safe-area'
import { InlineNotice, LoadingState, SectionPanel } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { useTwoFactorStatusQuery } from '@/lib/queries/auth'
import { useAuthStatus } from '@/lib/query-client'
import { SECURITY_STATUS_UNAVAILABLE } from '@/lib/security-display'
import { colors, spacing, webPointer } from '@/lib/theme'

/**
 * Account security: second factor, passkeys, and (later) linked accounts.
 *
 * Org-independent, so it lives at `/account/security` rather than under an org
 * id — an operator who belongs to several organizations has one set of
 * credentials, not one per org.
 */
export function SecuritySectionContent() {
  const router = useRouter()
  const statusQuery = useTwoFactorStatusQuery()
  const { data: instanceInfo } = useAuthStatus()
  const status = statusQuery.data
  const loading = statusQuery.isLoading
  // A failed first load leaves `status` undefined, which is not the same fact
  // as "two-factor off, no passkeys" — both cards go read-only rather than
  // offering enrollment and passkey controls the account may not need.
  const unavailable = !loading && status === undefined

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <Pressable
        onPress={() => {
          if (router.canGoBack()) {
            router.back()
            return
          }
          router.replace('/')
        }}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={({ pressed }) => [
          styles.back,
          pressed && styles.backPressed,
          webPointer,
        ]}
      >
        <Text style={styles.backLabel}>Back</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={panelStyles.pageEyebrow}>Account</Text>
        <Text style={panelStyles.pageTitle}>Security</Text>
        <Text style={panelStyles.pageCopy}>
          How you prove it is you. These settings follow your account across
          every organization you belong to.
        </Text>
      </View>

      {statusQuery.isError ? (
        <InlineNotice
          tone="warning"
          title="Could not load your security settings"
          body="Reload the page to try again."
        />
      ) : null}

      <SectionPanel
        title="Two-factor authentication"
        hint="A one-time code in addition to your password."
      >
        <TwoFactorBody
          loading={loading}
          unavailable={unavailable}
          status={status}
        />
      </SectionPanel>

      <SectionPanel
        title="Passkeys"
        hint="Sign in without a password, using your device."
      >
        <PasskeysPanel
          passkeys={status?.passkeys ?? []}
          loading={loading}
          unavailable={unavailable}
        />
      </SectionPanel>

      <SectionPanel
        title="Linked accounts"
        hint="Sign in with an identity provider."
      >
        <LinkedAccountsPanel
          linkedProviders={status?.linkedProviders ?? []}
          authProviders={instanceInfo?.authProviders ?? []}
          loading={loading}
          unavailable={unavailable}
        />
      </SectionPanel>
    </ScrollView>
  )
}

function TwoFactorBody({
  loading,
  unavailable,
  status,
}: Readonly<{
  loading: boolean
  unavailable: boolean
  status: ReturnType<typeof useTwoFactorStatusQuery>['data']
}>) {
  // The backup codes live here, above the enrol/manage swap: verifying the
  // first code flips `status.enabled`, which replaces the wizard with the
  // manage panel, and a sheet owned by the wizard would vanish with it.
  const [backupCodes, setBackupCodes] = useState<readonly string[] | null>(null)
  const onEnabled = useCallback((codes: readonly string[]) => setBackupCodes(codes), [])
  const onAcknowledge = useCallback(() => setBackupCodes(null), [])

  let body: ReactNode
  if (loading) body = <LoadingState label="Loading security settings…" />
  else if (unavailable || !status) {
    body = <Text style={panelStyles.muted}>{SECURITY_STATUS_UNAVAILABLE}</Text>
  } else if (status.enabled) body = <TwoFactorManage status={status} />
  else body = <TotpEnrollFlow onEnabled={onEnabled} />

  return (
    <>
      {body}
      <BackupCodesSheet
        visible={backupCodes !== null}
        codes={backupCodes ?? []}
        onAcknowledge={onAcknowledge}
      />
    </>
  )
}

export function SecuritySection() {
  return (
    <ScreenSafeArea>
      <SecuritySectionContent />
    </ScreenSafeArea>
  )
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    alignSelf: 'stretch',
    width: '100%',
  },
  page: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    gap: spacing.md,
    maxWidth: 780,
    width: '100%',
    alignSelf: 'center',
  },
  back: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingRight: spacing.md,
  },
  backPressed: {
    opacity: 0.7,
  },
  backLabel: {
    color: colors.textBody,
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    gap: spacing.xs,
  },
})
