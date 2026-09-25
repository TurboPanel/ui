import { useEffect, useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { Button, LoadingState } from '@/components/ui'
import { useAuth } from '@/lib/auth-context'
import { upgradeStatusQueryEnabled } from '@/lib/upgrade-status-query'
import { canQueryControlPlane } from '@/lib/control-plane-accounts'
import { getClientVersion, getInstanceRevision, getInstanceVersion } from '@/lib/instance-version'
import { useUpgradeActiveRun } from '@/lib/queries/admin'
import { isUpgradeRunActive } from '@/lib/upgrade-run-poll'
import {
  noteLoadedControlPlaneRevision,
  reloadWebClient,
  shouldPromptControlPlaneReload,
} from '@/lib/upgrade-reload'
import {
  clearControlPlaneUpgradeWatch,
  controlPlaneOverlayState,
  controlPlaneUpgradeWatchRemainingMs,
} from '@/lib/upgrade-watch'
import { colors, spacing } from '@/lib/theme'

export function ControlPlaneUpdatingOverlay() {
  const { session, isLoading } = useAuth()
  const adminQuery = !isLoading && upgradeStatusQueryEnabled({
    session,
    canQuery: canQueryControlPlane(),
  })
  const activeRun = useUpgradeActiveRun({ enabled: adminQuery })
  const [dismissReload, setDismissReload] = useState(false)
  const [dismissedUpdating, setDismissedUpdating] = useState(false)
  // Re-render when the watch lapses so a stale flag can never hold the scrim.
  const [, setTick] = useState(0)

  const runActive = isUpgradeRunActive(activeRun.data?.run?.status)
  const watchRemainingMs = controlPlaneUpgradeWatchRemainingMs()
  const controlPlaneStepActive =
    activeRun.data?.run?.phase === 'control_plane' && runActive
  const overlay = controlPlaneOverlayState({
    canReadRun: adminQuery,
    runAnswered: activeRun.isSuccess && !activeRun.isFetching,
    controlPlaneStepActive,
    watchActive: watchRemainingMs > 0,
  })
  const visible = overlay.visible && !dismissedUpdating

  const observedRevision = getInstanceRevision()
  const needsReload = shouldPromptControlPlaneReload({
    bundledVersion: getClientVersion(),
    observedVersion: getInstanceVersion(),
    loadedRevision: noteLoadedControlPlaneRevision(observedRevision),
    observedRevision,
  })

  useEffect(() => {
    if (overlay.clearWatch) clearControlPlaneUpgradeWatch()
  }, [overlay.clearWatch])

  useEffect(() => {
    if (watchRemainingMs <= 0) return
    const timer = setTimeout(() => setTick((n) => n + 1), watchRemainingMs + 50)
    return () => clearTimeout(timer)
  }, [watchRemainingMs])

  if (!visible && !(needsReload && !dismissReload)) return null

  if (needsReload && !dismissReload && !visible) {
    return (
      <View style={styles.scrim} accessibilityViewIsModal>
        <View style={styles.card}>
          <Text style={styles.title}>A newer control plane build is live</Text>
          <Text style={styles.copy}>
            Reload this page so the console matches the instance version on the wire.
          </Text>
          <View style={styles.actions}>
            {Platform.OS === 'web' ? (
              <Button label="Reload now" variant="primary" onPress={reloadWebClient} />
            ) : null}
            <Button
              label="Not now"
              variant="secondary"
              onPress={() => {
                setDismissReload(true)
              }}
            />
          </View>
        </View>
      </View>
    )
  }

  if (!visible) return null

  return (
    <View style={styles.scrim} accessibilityViewIsModal>
      <View style={styles.card}>
        <LoadingState label="TurboPanel is updating" />
        <Text style={styles.copy}>
          The control plane is restarting. This page will reconnect automatically.
        </Text>
        <View style={styles.actions}>
          <Button
            label="Continue without waiting"
            variant="secondary"
            onPress={() => {
              clearControlPlaneUpgradeWatch()
              setDismissedUpdating(true)
            }}
          />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    zIndex: 1000,
  },
  card: {
    maxWidth: 420,
    width: '100%',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgPanel,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  copy: {
    color: colors.textMuted,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
})
