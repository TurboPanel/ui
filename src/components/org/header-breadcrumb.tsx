import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { breadcrumbStyles, CRUMB_LINE_HEIGHT } from '@/components/org/breadcrumb-styles'
import { StatusChip } from '@/components/ui/v4/status-chip'
import type { Breadcrumb } from '@/lib/header-breadcrumb'
import { colors, spacing, webPointer } from '@/lib/theme'

/** React Native Web passes `title` through to the element; the native types omit it. */
const tooltip = (label: string) => ({ title: label }) as object

function Separator() {
  return (
    <Text style={breadcrumbStyles.separator} aria-hidden>
      {'›'}
    </Text>
  )
}

/**
 * The header breadcrumb: the organization (passed as `leading`, its menu
 * button styled as the first crumb), links to the pages above, then the
 * current object with its status. It shrinks first when the header is tight
 * (names end in an ellipsis and keep a tooltip with the full name); the
 * current object is the last to shrink.
 */
export function HeaderBreadcrumb({
  crumb,
  leading,
}: Readonly<{ crumb: Breadcrumb; leading?: ReactNode }>) {
  const router = useRouter()
  return (
    <View role="navigation" aria-label="Breadcrumb" style={styles.wrap}>
      {leading ? (
        <View style={styles.segment}>
          {leading}
          <Separator />
        </View>
      ) : null}
      {crumb.trail.map((entry) => (
        <View key={entry.href} style={styles.segment}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={entry.label}
            style={[breadcrumbStyles.link, webPointer]}
            onPress={() => router.push(entry.href as Href)}
            {...tooltip(entry.label)}
          >
            <Text style={breadcrumbStyles.linkText} numberOfLines={1}>
              {entry.label}
            </Text>
          </Pressable>
          <Separator />
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
  current: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    minWidth: 0,
    gap: spacing.sm,
  },
  currentText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: CRUMB_LINE_HEIGHT,
    flexShrink: 1,
    minWidth: 0,
  },
  chip: { flexShrink: 0 },
})
