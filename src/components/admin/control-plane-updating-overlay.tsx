import { useCallback, useEffect, useState } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { Button, LoadingState } from '@/components/ui'
import { useAuth } from '@/lib/auth-context'
import { upgradeStatusQueryEnabled } from '@/lib/upgrade-status-query'
import { canQueryControlPlane } from '@/lib/control-plane-accounts'
import { getClientVersion, getInstanceRevision, getInstanceVersion } from '@/lib/instance-version'
import { useUpgradeActiveRun } from '@/lib/queries/admin'
import { isUpgradeRunActive } from '@/lib/upgrade-run-poll'
import {
  RECONNECT_RETRY_LABEL,
  RECONNECT_SLOW_COPY,
  RECONNECTING_TITLE,
  isControlPlaneUnreachable,
  reconnectBody,
} from '@/lib/control-plane-reconnect'
import { useControlPlaneReconnect } from '@/lib/use-control-plane-reconnect'
import {
  noteLoadedControlPlaneRevision,
  reloadWebClient,
  shouldPromptControlPlaneReload,
} from '@/lib/upgrade-reload'
import {
  clearControlPlaneUpgradeWatch,
  controlPlaneOverlayState,
  controlPlaneStepStale,
  controlPlaneUpgradeWatchRemainingMs,
} from '@/lib/upgrade-watch'
import { colors, spacing } from '@/lib/theme'

export function ControlPlaneUpdatingOverlay() {
  const { session, isLoading } = useAuth()
  const adminQuery =
    !isLoading &&
    upgradeStatusQueryEnabled({
      session,
      canQuery: canQueryControlPlane(),
    })
  const activeRun = useUpgradeActiveRun({ enabled: adminQuery })
  const [dismissReload, setDismissReload] = useState(false)
  const [dismissedUpdating, setDismissedUpdating] = useState(false)
  // Re-render when the watch lapses so a stale flag can never hold the scrim.
  const [tick, setTick] = useState(0)

  const unreachable = activeRun.isError && isControlPlaneUnreachable(activeRun.error)
  const { refetch: refetchRun } = activeRun
  const retryRun = useCallback(() => {
    void refetchRun()
  }, [refetchRun])
  const reconnect = useControlPlaneReconnect(unreachable, retryRun)

  const runActive = isUpgradeRunActive(activeRun.data?.run?.status)
  const watchRemainingMs = controlPlaneUpgradeWatchRemainingMs()
  // A step the daemon never answered (or that went quiet for far too long)
  // must not hold the scrim; the Updates page says what it needs.
  const controlPlaneStepActive =
    activeRun.data?.run?.phase === 'control_plane' &&
    runActive &&
    !controlPlaneStepStale(activeRun.data?.run?.steps)
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
  }, [watchRemainingMs, tick])

  if (!visible && !(needsReload && !dismissReload)) return null

  if (needsReload && !dismissReload && !visible) {
    return <ReloadPrompt onDismiss={() => setDismissReload(true)} />
  }

  if (!visible) return null

  return (
    <UpdatingCard
      reconnect={reconnect}
      onContinue={() => {
        clearControlPlaneUpgradeWatch()
        setDismissedUpdating(true)
      }}
    />
  )
}

function ReloadPrompt({ onDismiss }: Readonly<{ onDismiss: () => void }>) {
  return (
    <View style={styles.scrim} accessibilityViewIsModal>
      <View style={styles.card}>
        <Text style={styles.title}>A newer control plane build is live</Text>
        <Text style={styles.copy}>
          Reload this page so the web app matches the control plane version.
        </Text>
        <View style={styles.actions}>
          {Platform.OS === 'web' ? (
            <Button label="Reload now" variant="primary" onPress={reloadWebClient} />
          ) : null}
          <Button label="Not now" variant="secondary" onPress={onDismiss} />
        </View>
      </View>
    </View>
  )
}

function UpdatingCard({
  reconnect,
  onContinue,
}: Readonly<{
  reconnect: ReturnType<typeof useControlPlaneReconnect>
  onContinue: () => void
}>) {
  const view = reconnect.view
  const slow = view?.phase === 'slow'
  const label = view ? RECONNECTING_TITLE : 'TurboPanel is updating'
  const copy = reconnectBody(view)
  return (
    <View style={styles.scrim} accessibilityViewIsModal>
      <View style={styles.card}>
        <LoadingState label={label} />
        <Text style={styles.copy}>{copy}</Text>
        {slow ? <Text style={styles.copy}>{RECONNECT_SLOW_COPY}</Text> : null}
        <View style={styles.actions}>
          {slow ? (
            <>
              <Button label={RECONNECT_RETRY_LABEL} variant="primary" onPress={reconnect.retryNow} />
              <Button label="Keep waiting" variant="secondary" onPress={reconnect.keepWaiting} />
            </>
          ) : null}
          <Button label="Continue without waiting" variant="secondary" onPress={onContinue} />
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
