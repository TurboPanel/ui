import { Image } from 'expo-image'
import { StyleSheet, Text, View, type ImageStyle } from 'react-native'
import type { OrgServerRecord } from '@/lib/instance-api'
import { osTextBadge, type OsTextBadge } from '@/lib/os-badges'
import { osLogoSource } from '@/lib/os-logos'
import { formatServerOsProductName, resolveOsLogoKey } from '@/lib/server-os-display'
import { colors, spacing } from '@/lib/theme'

type OsIdentityServer = Pick<OrgServerRecord, 'os' | 'osDisplay' | 'osLogo'>
type Density = 'row' | 'header'

function osMarkAccessibilityLabel(osProduct: string | null): string {
  return osProduct ?? 'OS'
}

/**
 * Host OS identity beside the server name. Every mark sits in one fixed slot
 * per density so names line up down the list: the licensed PNG when we ship
 * one, a lettered badge for an OS whose mark we can't ship (Raspberry Pi OS),
 * otherwise the product name as plain text.
 */
export function OsIdentityMark({
  server,
  density,
}: Readonly<{
  server: OsIdentityServer
  density: Density
}>) {
  const osProduct = formatServerOsProductName(server.os, server.osDisplay)
  const logoKey = resolveOsLogoKey(server)
  const logo = osLogoSource(logoKey)
  const badge = osTextBadge(logoKey)
  const accessibilityLabel = osMarkAccessibilityLabel(osProduct)
  const slotStyle = density === 'header' ? styles.headerSlot : styles.rowSlot

  if (logo) {
    const imageStyle = density === 'header' ? styles.headerLogo : styles.rowLogo
    return (
      <View style={slotStyle}>
        <Image
          source={logo}
          style={imageStyle as ImageStyle}
          contentFit="contain"
          accessibilityLabel={accessibilityLabel}
        />
      </View>
    )
  }

  if (badge) {
    return (
      <View style={slotStyle}>
        <OsBadge badge={badge} density={density} />
      </View>
    )
  }

  if (!osProduct) {
    return null
  }

  const textStyle = density === 'header' ? styles.headerText : styles.rowText
  return (
    <Text
      style={textStyle}
      numberOfLines={2}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
    >
      {osProduct}
    </Text>
  )
}

function OsBadge({ badge, density }: Readonly<{ badge: OsTextBadge; density: Density }>) {
  const header = density === 'header'
  return (
    <View
      style={header ? styles.headerBadge : styles.rowBadge}
      accessible
      accessibilityRole="image"
      accessibilityLabel={badge.label}
    >
      {badge.lines.map((line) => (
        <Text
          key={line}
          style={header ? styles.headerBadgeText : styles.rowBadgeText}
          numberOfLines={1}
          importantForAccessibility="no"
        >
          {line}
        </Text>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  // One slot per density: the Debian PNG (18×24 / 28×36) and the badge both
  // centre in it, so a Pi row's name starts where a Debian row's does.
  rowSlot: {
    width: 26,
    height: 24,
    flexShrink: 0,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  headerSlot: {
    width: 36,
    height: 36,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLogo: {
    width: 18,
    height: 24,
    opacity: 0.9,
  },
  headerLogo: {
    width: 28,
    height: 36,
  },
  rowBadge: {
    width: 26,
    height: 22,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadge: {
    width: 36,
    height: 34,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBadgeText: {
    color: colors.textChip,
    fontSize: 8,
    fontWeight: '700',
    lineHeight: 9,
    letterSpacing: 0.2,
  },
  headerBadgeText: {
    color: colors.textChip,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 13,
    letterSpacing: 0.3,
  },
  rowText: {
    flexShrink: 0,
    alignSelf: 'center',
    marginRight: spacing.xs,
    maxWidth: 72,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 13,
  },
  headerText: {
    flexShrink: 0,
    maxWidth: 96,
    paddingTop: 2,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
})
