import { type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { GlassSurface } from '@/components/glass/glass-surface'
import { glass } from '@/lib/glass'
import { chrome, colors } from '@/lib/theme'

export function SectionPanel({
  title,
  hint,
  accent,
  headerRight,
  children,
}: Readonly<{
  title?: string
  hint?: string
  accent?: boolean
  /** Optional trailing control in the title row (e.g. project server picker). */
  headerRight?: ReactNode
  children: ReactNode
}>) {
  return (
    <GlassSurface style={styles.area} intensity="soft">
      {title ? (
        <View style={[styles.areaHeader, accent && styles.areaHeaderAccent]}>
          {accent ? <View style={styles.accentStripe} /> : null}
          <View style={styles.areaHeaderCopy}>
            <Text style={styles.areaTitle}>{title}</Text>
            {hint ? <Text style={styles.areaHint}>{hint}</Text> : null}
          </View>
          {headerRight ? (
            <View style={styles.areaHeaderRight}>{headerRight}</View>
          ) : null}
        </View>
      ) : null}
      <View style={styles.areaBody}>{children}</View>
    </GlassSurface>
  )
}

const styles = StyleSheet.create({
  area: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  areaHeader: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderArea,
    backgroundColor: glass.fillSoft,
  },
  areaHeaderAccent: {
    backgroundColor: colors.bgActive,
  },
  accentStripe: {
    width: 3,
    backgroundColor: chrome.accent,
  },
  areaHeaderCopy: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  areaHeaderRight: {
    flexShrink: 0,
    paddingRight: 12,
    paddingLeft: 4,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  areaTitle: {
    color: colors.textTitle,
    fontSize: 14,
    fontWeight: '600',
  },
  areaHint: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 2,
  },
  areaBody: {
    padding: 14,
    gap: 8,
  },
})
