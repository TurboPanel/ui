import { useState, type ReactNode } from 'react'
import { View } from 'react-native'
import { TextLink } from '@/components/ui/text-link'
import { Card } from '@/components/ui/v4/card'
import { SectionHeading } from '@/components/ui/v4/section-heading'

const styles = {
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  body: { gap: 8 },
} as const

/**
 * A page section: the 17 px `SectionHeading` over one card that holds its
 * content. This is the drop-in for the old `SectionPanel` (a tinted glass
 * header with an accent stripe) on project screens.
 *
 * `collapsible` adds a Show / Hide link on the right of the heading for a
 * section people rarely open; the content is not drawn while it is hidden.
 */
export function Section({
  title,
  note,
  action,
  collapsible = false,
  defaultCollapsed = false,
  onToggle,
  children,
}: Readonly<{
  title: string
  /** A short grey line after the title. */
  note?: string
  /** A link or button pushed to the right of the heading. */
  action?: ReactNode
  collapsible?: boolean
  defaultCollapsed?: boolean
  /** Fires after Show / Hide with the new open state. */
  onToggle?: (expanded: boolean) => void
  children: ReactNode
}>) {
  const [collapsed, setCollapsed] = useState(collapsible && defaultCollapsed)
  const expanded = !collapsible || !collapsed
  const disclosure = collapsible ? (
    <TextLink
      label={expanded ? 'Hide' : 'Show'}
      size="sm"
      expanded={expanded}
      accessibilityLabel={expanded ? `Collapse ${title}` : `Expand ${title}`}
      onPress={() => {
        setCollapsed(expanded)
        onToggle?.(!expanded)
      }}
    />
  ) : null
  const right =
    action && disclosure ? (
      <View style={styles.actions}>
        {action}
        {disclosure}
      </View>
    ) : (
      (action ?? disclosure)
    )
  return (
    <View>
      <SectionHeading title={title} note={note} action={right ?? undefined} />
      {expanded ? (
        <Card>
          <View style={styles.body}>{children}</View>
        </Card>
      ) : null}
    </View>
  )
}
