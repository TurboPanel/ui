import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { StatusChip } from '@/components/ui/v4/status-chip'
import type { Breadcrumb } from '@/lib/header-breadcrumb'
import { colors, spacing, webPointer } from '@/lib/theme'

/** React Native Web passes `title` through to the element; the native types omit it. */
const tooltip = (label: string) => ({ title: label }) as object

/**
 * The breadcrumb beside the organization name: links to the pages above, then
 * the current object with its status. It shrinks first when the header is
 * tight (names end in an ellipsis and keep a tooltip with the full name); the
 * current object is the last to shrink.
 */
export function HeaderBreadcrumb({ crumb }: Readonly<{ crumb: Breadcrumb }>) {
  const router = useRouter()
  return (
    <View role="navigation" aria-label="Breadcrumb" style={styles.wrap}>
      {crumb.trail.map((entry) => (
        <View key={entry.href} style={styles.segment}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={entry.label}
            style={[styles.trailLink, webPointer]}
            onPress={() => router.push(entry.href as Href)}
            {...tooltip(entry.label)}
          >
            <Text style={styles.trailText} numberOfLines={1}>
              {entry.label}
            </Text>
          </Pressable>
          <Text style={styles.separator} aria-hidden>
            {'›'}
          </Text>
        </View>
      ))}
      <View style={styles.current} aria-current="page" {...tooltip(crumb.current.label)}>
        <Text style={styles.currentText} numberOfLines={1}>
          {crumb.current.label}
        </Text>
        {crumb.current.chip ? (
          <View style={styles.chip}>
            <StatusChip
              status={crumb.current.chip.key}
              label={crumb.current.chip.label}
              size="sm"
            />
          </View>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 3,
    minWidth: 0,
    gap: spacing.xs,
  },
  trailLink: {
    flexShrink: 1,
    minWidth: 0,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  trailText: { color: colors.textMuted, fontSize: 13, fontWeight: '500' },
  separator: { color: colors.textDim, fontSize: 14, flexShrink: 0 },
  current: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    minWidth: 0,
    gap: spacing.sm,
  },
  currentText: { color: colors.text, fontSize: 14, fontWeight: '700', flexShrink: 1, minWidth: 0 },
  chip: { flexShrink: 0 },
})
