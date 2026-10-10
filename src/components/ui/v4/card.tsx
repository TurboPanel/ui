import { type ReactNode } from 'react'
import { View } from 'react-native'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { RADIUS } from '@/lib/v4/ui-scale'

const styles = themedStyles((p) => ({
  card: {
    backgroundColor: p.surface,
    borderWidth: 1,
    borderColor: p.sep,
    borderRadius: RADIUS.card,
  },
  strong: { borderColor: p.sepStrong },
  padded: { padding: 20 },
}))

/**
 * A card: surface fill, hairline border, 12 px corners. `padded` adds the 20 px
 * card padding; leave it off when the children are rows that run edge to edge
 * (use `ListGroup` for that).
 */
export function Card({
  children,
  padded = true,
  strong = false,
}: Readonly<{ children: ReactNode; padded?: boolean; strong?: boolean }>) {
  const s = styles(usePalette())
  return <View style={[s.card, strong && s.strong, padded && s.padded]}>{children}</View>
}
