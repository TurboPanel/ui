import { LinearGradient } from 'expo-linear-gradient'
import { useRouter, type Href } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { useVersionUpdateEntry } from '@/components/brand/use-version-update-entry'
import { VersionsSheet } from '@/components/brand/versions-sheet'
import { UpdatesNavIcon } from '@/components/icons/nav-icons'
import { useAuth } from '@/lib/auth-context'
import { controlPlaneEnvironmentLabel, controlPlaneVersionLabel } from '@/lib/control-plane-version'
import { haWordmarkColors } from '@/lib/ha-wordmark-colors'
import type { HealthResponse } from '@/lib/instance-api'
import {
  HA_PRODUCT_NAME,
  HA_WORDMARK_SHORT,
  HA_WORDMARK_TEXT,
  showsHighAvailabilityWordmark,
} from '@/lib/platform-copy'
import { useControlPlaneHealth } from '@/lib/queries/system'
import { colors, webPointer } from '@/lib/theme'
import { updateIndicator, versionClick, versionEntryAccessibilityLabel } from '@/lib/update-entry'
import { useColors, useColorScheme } from '@/lib/theme-preference'

/**
 * "HIGH AVAILABILITY" beside the T mark on the hosted (Workers) control
 * plane — one line of tiny letter-spaced caps in a slim pill with a 1px
 * HA-blue gradient border. `compact` is the narrow-header form: the same
 * pill reading "HA". Renders nothing until the runtime is known
 * (`controlPlaneRuntime` is hydrated from storage before `/status` answers),
 * and nothing at all on self-hosted.
 *
 * The border is an outer gradient with 1px padding around an inner
 * blue-tinted fill, so it reads the same on every surface it sits on. In
 * light mode the text is white on a solid HA-blue fill (`haWordmarkColors`).
 *
 * Under the full pill, right-aligned to its edge: the version line. It is the
 * control plane's running build from `/api/health` (`v0.1.21-canary.24`,
 * never the commit), then a yellow word on a build that is not live
 * (hosted: Testing / Staging; self-hosted: Canary / RC), then an update icon
 * when this viewer has an update to apply ("Update" beside it on a live
 * build). Clicking it opens the versions popup, or the update screen when
 * there is an update to apply (`lib/update-entry.ts`). Its line is reserved
 * from the first render so the pill never moves when it arrives; the compact
 * pill has no version line. On a narrow sidebar the version truncates first.
 *
 * Self-hosted has no pill and no edition text: the full form is just the
 * version line beside the T, with the same behaviour.
 *
 * The organization comes from the route (`/[orgId]/…`), so an organization
 * manager is sent to that organization's Servers page.
 *
 * `style` is applied to whatever the wordmark renders (its root), so a caller
 * can nudge it without a wrapper that would stay behind when it renders nothing.
 *
 * `showVersion={false}` (the sign-in and sign-up screens) is the full pill
 * alone: no version line, no `/api/health` read, nothing on self-hosted.
 */
export function HighAvailabilityWordmark({
  compact = false,
  showVersion = true,
  style,
}: Readonly<{
  compact?: boolean
  showVersion?: boolean
  style?: StyleProp<ViewStyle>
}>) {
  const { controlPlaneRuntime } = useAuth()
  // The gradient needs real colour values, not theme variables.
  const palette = useColors()
  const pillColors = haWordmarkColors(useColorScheme(), palette)
  const shown = showsHighAvailabilityWordmark(controlPlaneRuntime)
  const selfHosted = controlPlaneRuntime === 'deno'
  const withVersion = showVersion && !compact
  const health = useControlPlaneHealth({ enabled: (shown || selfHosted) && withVersion })
  if (selfHosted && withVersion) {
    return (
      <View style={[styles.stack, styles.stackSelfHosted, style]}>
        <VersionLine health={health.data} runtime="deno" />
      </View>
    )
  }
  if (!shown) return null

  const pill = (
    <LinearGradient
      // HA blue fading to its light tint: the pill's 1px border.
      colors={[palette.brand, palette.link]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.border, withVersion && styles.borderInStack, !withVersion && style]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={HA_PRODUCT_NAME}
    >
      <View
        style={[styles.fill, compact && styles.fillCompact, { backgroundColor: pillColors.fill }]}
      >
        <Text
          style={[styles.text, compact && styles.textCompact, { color: pillColors.text }]}
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
    <View style={[styles.stack, style]}>
      {pill}
      <VersionLine health={health.data} runtime="workers" />
    </View>
  )
}

function VersionLine({
  health,
  runtime,
}: Readonly<{ health: HealthResponse | undefined; runtime: 'deno' | 'workers' }>) {
  const router = useRouter()
  const [versionsOpen, setVersionsOpen] = useState(false)
  const { viewer, pending, orgId } = useVersionUpdateEntry()
  const version = controlPlaneVersionLabel(health)
  const environment = controlPlaneEnvironmentLabel(health, runtime)
  const indicator = updateIndicator({ pending, live: environment === null })
  const click = versionClick({ viewer, pending, orgId })
  const onPress = () => {
    if (click.kind === 'navigate') router.push(click.href as Href)
    else setVersionsOpen(true)
  }

  return (
    <>
      <Pressable
        style={[styles.versionRow, webPointer]}
        onPress={onPress}
        disabled={version === null}
        accessibilityRole="button"
        accessibilityLabel={versionEntryAccessibilityLabel({
          version,
          environment,
          pending,
          click,
        })}
      >
        <Text style={[styles.version, styles.versionText]} numberOfLines={1}>
          {version ?? ''}
        </Text>
        {environment ? <EnvironmentLabel text={environment} /> : null}
        {indicator.icon ? <UpdateMark word={indicator.word} /> : null}
      </Pressable>
      <VersionsSheet
        visible={versionsOpen}
        health={health}
        onClose={() => setVersionsOpen(false)}
      />
    </>
  )
}

/** The yellow word beside the version on a build that is not live. */
function EnvironmentLabel({ text }: Readonly<{ text: string }>) {
  return (
    <View style={styles.environment} importantForAccessibility="no-hide-descendants">
      <Text style={styles.environmentText} numberOfLines={1}>
        {text}
      </Text>
    </View>
  )
}

/** The update icon, with the word "Update" beside it on a live build. */
function UpdateMark({ word }: Readonly<{ word: string | null }>) {
  return (
    <View style={styles.update} importantForAccessibility="no-hide-descendants">
      <UpdatesNavIcon size={11} color={colors.command} />
      {word ? (
        <Text style={styles.updateWord} numberOfLines={1}>
          {word}
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
    maxWidth: '100%',
    minWidth: 0,
  },
  version: {
    height: 11,
    color: colors.textMuted,
    fontSize: 9,
    lineHeight: 11,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.3,
  },
  versionText: {
    flexShrink: 1,
    minWidth: 0,
  },
  environment: {
    flexShrink: 0,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.warnLine,
    backgroundColor: colors.warnSoft,
    paddingHorizontal: 5,
  },
  environmentText: {
    color: colors.warn,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  update: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  updateWord: {
    color: colors.command,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '700',
  },
  fill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  fillCompact: {
    paddingHorizontal: 6,
  },
  text: {
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
