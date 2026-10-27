import { useRouter, type Href } from 'expo-router'
import { useMemo, useState } from 'react'
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { readConsoleBuild } from '@/components/admin/updates/console-build'
import { adminAreaHref } from '@/lib/admin-navigation'
import { Button, InlineNotice, TextLink } from '@/components/ui'
import { isAdminSession, useAuth } from '@/lib/auth-context'
import { useInstallStatusQuery } from '@/lib/queries/auth'
import { useInstanceUpdates, useUpgradeActiveRun } from '@/lib/queries/admin'
import {
  readDismissedUpdateBanner,
  showsUpdateBanner,
  updateBanner,
  updateOffered,
  writeDismissedUpdateBanner,
  type UpdateBanner,
} from '@/lib/update-status'
import { colors, layout, spacing } from '@/lib/theme'

function webStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

/**
 * The offered update for an instance admin on a self-hosted control plane, or null.
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
  const eligible = showsUpdateBanner({
    isInstanceAdmin: isAdminSession(session),
    runtime: status.data?.runtime,
  })
  const consoleBuild = useMemo(() => readConsoleBuild(), [])
  const updates = useInstanceUpdates({ enabled: eligible, consoleCommit: consoleBuild?.commit })
  const active = useUpgradeActiveRun({ enabled: eligible })
  const [dismissedKey, setDismissedKey] = useState(() => readDismissedUpdateBanner(webStorage()))
  const offer = { updates: updates.data, activeRun: Boolean(active.data?.run), consoleBuild }
  return {
    banner: eligible ? updateBanner({ ...offer, dismissedKey }) : null,
    available: eligible && updateOffered(offer),
    dismiss: (key) => {
      writeDismissedUpdateBanner(webStorage(), key)
      setDismissedKey(key)
    },
  }
}

/**
 * "Update available: control plane v0.1.5-canary.1" across the top of the app.
 * Updates install on their own, so it only says so and links to Admin >
 * Updates. On a phone-width window it is one line, "Update available ·
 * Details", so it never takes a third of the screen. On a wide window one line
 * of title and at most two of detail.
 */
export function UpdateAvailableBanner() {
  const router = useRouter()
  const { width } = useWindowDimensions()
  const { banner, dismiss } = useUpdateAvailable()
  if (!banner) return null
  const openUpdates = () => {
    router.push(adminAreaHref('updates') as Href)
  }
  const dismissButton = (
    <Button
      label="Dismiss"
      variant="ghost"
      size={width < layout.desktopBreakpoint ? 'sm' : 'md'}
      accessibilityLabel="Dismiss the update notice"
      onPress={() => {
        dismiss(banner.key)
      }}
    />
  )
  if (width < layout.desktopBreakpoint) {
    return (
      <View style={styles.root}>
        <View style={styles.compact}>
          <Text style={styles.compactTitle} numberOfLines={1}>
            Update available ·
          </Text>
          <TextLink
            label="Details"
            accessibilityLabel={`Open Admin > Updates. ${banner.title}`}
            onPress={openUpdates}
          />
          <View style={styles.compactFill} />
          {dismissButton}
        </View>
      </View>
    )
  }
  return (
    <View style={styles.root}>
      <InlineNotice
        title={banner.title}
        body={banner.body}
        titleLines={1}
        bodyLines={2}
        actions={
          <>
            <Button label="See updates" variant="secondary" onPress={openUpdates} />
            {dismissButton}
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
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderLeftWidth: 3,
    borderLeftColor: colors.command,
    backgroundColor: colors.bgSecondary,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
  },
  compactTitle: {
    flexShrink: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  compactFill: {
    flex: 1,
  },
})
