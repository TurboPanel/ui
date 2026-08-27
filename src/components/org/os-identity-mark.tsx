import { Image } from 'expo-image'
import { StyleSheet, Text, type ImageStyle } from 'react-native'
import type { OrgServerRecord } from '@/lib/instance-api'
import { osLogoSource } from '@/lib/os-logos'
import { formatServerOsProductName, resolveOsLogoKey } from '@/lib/server-os-display'
import { colors, spacing } from '@/lib/theme'

type OsIdentityServer = Pick<OrgServerRecord, 'os' | 'osDisplay' | 'osLogo'>

function osMarkAccessibilityLabel(osProduct: string | null): string {
  return osProduct ?? 'OS'
}

/**
 * Host OS identity beside the server name: licensed PNG when we ship one,
 * otherwise the product name as plain text (e.g. Raspberry Pi OS).
 */
export function OsIdentityMark({
  server,
  density,
}: Readonly<{
  server: OsIdentityServer
  density: 'row' | 'header'
}>) {
  const osProduct = formatServerOsProductName(server.os, server.osDisplay)
  const logo = osLogoSource(resolveOsLogoKey(server))
  const accessibilityLabel = osMarkAccessibilityLabel(osProduct)

  if (logo) {
    const imageStyle = density === 'header' ? styles.headerLogo : styles.rowLogo
    return (
      <Image
        source={logo}
        style={imageStyle as ImageStyle}
        contentFit="contain"
        accessibilityLabel={accessibilityLabel}
      />
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

const styles = StyleSheet.create({
  rowLogo: {
    width: 18,
    height: 24,
    flexShrink: 0,
    alignSelf: 'center',
    marginRight: spacing.xs,
    opacity: 0.9,
  },
  headerLogo: {
    width: 28,
    height: 36,
    flexShrink: 0,
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
