import { LinearGradient } from 'expo-linear-gradient'
import { Linking, StyleSheet, Text, View } from 'react-native'
import { useAuth } from '@/lib/auth-context'
import { controlPlaneVersionLine } from '@/lib/control-plane-version'
import type { HealthResponse } from '@/lib/instance-api'
import {
  HA_PRODUCT_NAME,
  HA_WORDMARK_SHORT,
  HA_WORDMARK_TEXT,
  showsHighAvailabilityWordmark,
} from '@/lib/platform-copy'
import { useControlPlaneHealth } from '@/lib/queries/system'
import { colors } from '@/lib/theme'

/** HA blue fading to its light tint: the pill's 1px border. */
const BORDER_GRADIENT = [colors.blue, colors.command] as const

/**
 * "HIGH AVAILABILITY" beside the T mark on the hosted (Workers) control
 * plane — one line of tiny letter-spaced caps in a slim pill with a 1px
 * HA-blue gradient border. `compact` is the narrow-header form: the same
 * pill reading "HA". Renders nothing until the runtime is known
 * (`controlPlaneRuntime` is hydrated from storage before `/status` answers),
 * and nothing at all on self-hosted.
 *
 * The border is an outer gradient with 1px padding around an inner
 * blue-tinted fill, so it reads the same on every surface it sits on.
 *
 * Under the full pill, right-aligned to its edge: the control plane's version
 * (and short commit, linked to the source) from `/api/health`, followed on a
 * testing or staging deployment by the environment in its colour ("Testing"
 * amber, "Staging" blue; nothing on live). Its line is reserved from the first
 * render so the pill never moves when it arrives; the compact pill has no
 * version line.
 *
 * Self-hosted has no pill: the full form is just the version line beside the
 * T, carrying the exact installed build label (`v0.1.1-canary.…`,
 * `v0.1.1-rc.1`) when the control plane reports one.
 *
 * `showVersion={false}` (the sign-in and sign-up screens) is the full pill
 * alone: no version line, no `/api/health` read, nothing on self-hosted.
 */
export function HighAvailabilityWordmark({
  compact = false,
  showVersion = true,
}: Readonly<{ compact?: boolean; showVersion?: boolean }>) {
  const { controlPlaneRuntime } = useAuth()
  const shown = showsHighAvailabilityWordmark(controlPlaneRuntime)
  const selfHosted = controlPlaneRuntime === 'deno'
  const withVersion = showVersion && !compact
  const health = useControlPlaneHealth({ enabled: (shown || selfHosted) && withVersion })
  if (selfHosted && withVersion) {
    return (
      <View style={[styles.stack, styles.stackSelfHosted]}>
        <VersionLine health={health.data} runtime="deno" />
      </View>
    )
  }
  if (!shown) return null

  const pill = (
    <LinearGradient
      colors={BORDER_GRADIENT}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.border, withVersion && styles.borderInStack]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={HA_PRODUCT_NAME}
    >
      <View style={[styles.fill, compact && styles.fillCompact]}>
        <Text
          style={[styles.text, compact && styles.textCompact]}
          numberOfLines={1}
          importantForAccessibility="no"
        >
          {compact ? HA_WORDMARK_SHORT : HA_WORDMARK_TEXT}
        </Text>
      </View>
    </LinearGradient>
  )
  if (!withVersion) return pill

  return (
    <View style={styles.stack}>
      {pill}
      <VersionLine health={health.data} runtime="workers" />
    </View>
  )
}

const ENVIRONMENT_COLOR = {
  testing: colors.pending,
  staging: colors.command,
} as const

function VersionLine({
  health,
  runtime,
}: Readonly<{ health: HealthResponse | undefined; runtime: 'deno' | 'workers' }>) {
  const versionLine = controlPlaneVersionLine(health, runtime)
  const commitUrl = versionLine?.commitUrl ?? null
  const environment = versionLine?.environment ?? null
  return (
    <View style={styles.versionRow}>
      <Text
        style={styles.version}
        numberOfLines={1}
        {...(commitUrl
          ? {
              accessibilityRole: 'link' as const,
              accessibilityLabel: `Control plane ${versionLine?.label ?? ''}, view source commit`,
              onPress: () => {
                void Linking.openURL(commitUrl).catch(() => undefined)
              },
            }
          : {})}
      >
        {versionLine?.label ?? ''}
      </Text>
      {environment ? (
        <Text
          style={[styles.version, styles.environment, { color: ENVIRONMENT_COLOR[environment.tone] }]}
          numberOfLines={1}
          accessibilityLabel={`${environment.text} environment`}
        >
          {environment.text}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  border: {
    padding: 1,
    borderRadius: 999,
    flexShrink: 1,
    minWidth: 0,
    alignSelf: 'center',
  },
  borderInStack: {
    alignSelf: 'flex-end',
  },
  stack: {
    flexShrink: 1,
    minWidth: 0,
    alignSelf: 'center',
    alignItems: 'flex-end',
  },
  stackSelfHosted: {
    alignItems: 'flex-start',
  },
  versionRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  environment: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  version: {
    height: 11,
    color: colors.textMuted,
    fontSize: 9,
    lineHeight: 11,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.3,
  },
  fill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: colors.bgActiveBlue,
  },
  fillCompact: {
    paddingHorizontal: 6,
  },
  text: {
    color: colors.textTitle,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  textCompact: {
    letterSpacing: 1,
  },
})
