import { type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors } from '@/lib/theme'

export function SectionPanel({
  title,
  hint,
  accent,
  children,
}: Readonly<{
  title?: string
  hint?: string
  accent?: boolean
  children: ReactNode
}>) {
  return (
    <View style={styles.area}>
      {title ? (
        <View style={[styles.areaHeader, accent && styles.areaHeaderAccent]}>
          {accent ? <View style={styles.accentStripe} /> : null}
          <View style={styles.areaHeaderCopy}>
            <Text style={styles.areaTitle}>{title}</Text>
            {hint ? <Text style={styles.areaHint}>{hint}</Text> : null}
          </View>
        </View>
      ) : null}
      <View style={styles.areaBody}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  area: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgArea,
    overflow: 'hidden',
  },
  areaHeader: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderArea,
    backgroundColor: colors.bgAreaHeader,
  },
  areaHeaderAccent: {
    backgroundColor: colors.bgActive,
  },
  accentStripe: {
    width: 3,
    backgroundColor: colors.accent,
  },
  areaHeaderCopy: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
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
