import { useRouter, type Href } from 'expo-router'
import { useMemo, useState } from 'react'
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { readConsoleBuild } from '@/components/admin/updates/console-build'
import { adminAreaHref } from '@/lib/admin-navigation'
import { Button, InlineNotice, TextLink } from '@/components/ui'
import { isAdminSession, useAuth } from '@/lib/auth-context'
import { useInstallStatusQuery } from '@/lib/queries/auth'
import { useDevelopmentUpdates, useInstanceUpdates, useUpgradeActiveRun } from '@/lib/queries/admin'
import {
  developmentBanner,
  developmentChangesPending,
  isDevelopmentInstall,
} from '@/lib/development-updates'
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
 * Shared by the banner and the admin sidebar badge. On a development install
 * nothing is offered from the release channel; the banner and badge show only
 * while some server lacks the checkout's daemon changes.
 */
export function useUpdateAvailable(): Readonly<{
  banner: UpdateBanner | null
  /** An update is on offer, dismissed or not (the admin nav badge). */
  available: boolean
  /** A development install: the banner speaks about daemon changes, not releases. */
  development: boolean
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
  const development = eligible && isDevelopmentInstall(updates.data)
  const developmentQuery = useDevelopmentUpdates({ enabled: development })
  const [dismissedKey, setDismissedKey] = useState(() => readDismissedUpdateBanner(webStorage()))
  const offer = { updates: updates.data, activeRun: Boolean(active.data?.run), consoleBuild }
  let banner: UpdateBanner | null = null
  let available = false
  if (development) {
    banner = developmentBanner({ development: developmentQuery.data, dismissedKey })
    available = developmentChangesPending(developmentQuery.data)
  } else if (eligible) {
    banner = updateBanner({ ...offer, dismissedKey })
    available = updateOffered(offer)
  }
  return {
    banner,
    available,
    development,
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
 * See Updates", so it never takes a third of the screen. On a wide window one line
 * of title and at most two of detail. On a development install it says
 * "Daemon changes are not on your servers yet." with **Open Updates** instead.
 */
export function UpdateAvailableBanner() {
  const router = useRouter()
  const { width } = useWindowDimensions()
  const { banner, development, dismiss } = useUpdateAvailable()
  if (!banner) return null
  const linkLabel = development ? 'Open Updates' : 'See Updates'
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
            {development ? 'Daemon changes waiting ·' : 'Update available ·'}
          </Text>
          <TextLink
            label={linkLabel}
            accessibilityLabel={`${linkLabel} in Admin > Updates. ${banner.title}`}
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
            <Button label={linkLabel} variant="secondary" onPress={openUpdates} />
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
