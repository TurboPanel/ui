import { type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors } from '@/lib/theme'

export function SectionPanel({
  title,
  hint,
  children,
}: Readonly<{
  title: string
  hint?: string
  children: ReactNode
}>) {
  return (
    <View style={styles.area}>
      <View style={styles.areaHeader}>
        <Text style={styles.areaTitle}>{title}</Text>
        {hint ? <Text style={styles.areaHint}>{hint}</Text> : null}
      </View>
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderArea,
    backgroundColor: colors.bgAreaHeader,
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
