import { useRouter, type Href } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Button, InlineNotice } from '@/components/ui'
import { isSuperadminSession, useAuth } from '@/lib/auth-context'
import { useInstallStatusQuery } from '@/lib/queries/auth'
import { useInstanceUpdates, useUpgradeActiveRun } from '@/lib/queries/admin'
import {
  readDismissedUpdateBanner,
  UPDATE_NOW_HREF,
  updateBanner,
  writeDismissedUpdateBanner,
  type UpdateBanner,
} from '@/lib/update-status'
import { spacing } from '@/lib/theme'

function webStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

/**
 * The offered update for a superadmin on a self-hosted control plane, or null.
 * Shared by the banner and the admin sidebar badge.
 */
export function useUpdateAvailable(): Readonly<{
  banner: UpdateBanner | null
  /** An update is on offer, dismissed or not (the admin nav badge). */
  available: boolean
  dismiss: (key: string) => void
}> {
  const { session } = useAuth()
  const status = useInstallStatusQuery()
  const eligible = isSuperadminSession(session) && status.data?.runtime === 'deno'
  const updates = useInstanceUpdates({ enabled: eligible })
  const active = useUpgradeActiveRun({ enabled: eligible })
  const [dismissedKey, setDismissedKey] = useState(() => readDismissedUpdateBanner(webStorage()))
  const offered = eligible
    ? updateBanner({
        updates: updates.data,
        activeRun: Boolean(active.data?.run),
        dismissedKey: null,
      })
    : null
  return {
    banner: offered && offered.key !== dismissedKey ? offered : null,
    available: offered !== null,
    dismiss: (key) => {
      writeDismissedUpdateBanner(webStorage(), key)
      setDismissedKey(key)
    },
  }
}

/** "TurboPanel <build> is available — Update" across the top of the app. */
export function UpdateAvailableBanner() {
  const router = useRouter()
  const { banner, dismiss } = useUpdateAvailable()
  if (!banner) return null
  return (
    <View style={styles.root}>
      <InlineNotice
        title={banner.title}
        body="Updates the control plane, its daemon, and then your servers, one managed run."
        actions={
          <>
            <Button
              label="Update"
              variant="primary"
              onPress={() => {
                router.push(UPDATE_NOW_HREF as Href)
              }}
            />
            <Button
              label="Dismiss"
              variant="ghost"
              onPress={() => {
                dismiss(banner.key)
              }}
            />
          </>
        }
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
})
