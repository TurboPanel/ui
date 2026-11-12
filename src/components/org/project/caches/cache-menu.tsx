import { useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { webPointer } from '@/lib/theme'
import { RADIUS } from '@/lib/v4/ui-scale'

export type CacheMenuAction = 'edit' | 'variables' | 'delete'

type Item = Readonly<{ id: CacheMenuAction; label: string; danger?: boolean }>

const READ_ITEMS: readonly Item[] = [{ id: 'variables', label: 'Show Variables' }]

const MANAGE_ITEMS: readonly Item[] = [
  { id: 'edit', label: 'Edit' },
  { id: 'variables', label: 'Show Variables' },
  { id: 'delete', label: 'Delete', danger: true },
]

const styles = themedStyles((p) => ({
  button: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.pill },
  glyph: { ...typeStyle('bodySemibold', 'headline'), color: p.text2 },
  scrim: { flex: 1, backgroundColor: p.scrim, justifyContent: 'center', padding: 16 },
  card: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 280,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: p.sepStrong,
    backgroundColor: p.surface,
    paddingVertical: 6,
    zIndex: 2,
  },
  item: { paddingHorizontal: 16, paddingVertical: 12 },
  itemPressed: { backgroundColor: p.press },
  label: { ...typeStyle('bodyMedium', 'body'), color: p.text },
  danger: { color: p.bad },
}))

/** The "⋯" menu of a cache row: Edit, Show Variables, Delete (read access only sees the variables). */
export function CacheMenu({
  name,
  canManage,
  onSelect,
}: Readonly<{ name: string; canManage: boolean; onSelect: (action: CacheMenuAction) => void }>) {
  const s = styles(usePalette())
  const [open, setOpen] = useState(false)
  const items = canManage ? MANAGE_ITEMS : READ_ITEMS
  const close = () => setOpen(false)
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Actions for cache ${name}`}
        accessibilityState={{ expanded: open }}
        hitSlop={8}
        style={[s.button, webPointer]}
      >
        <Text style={s.glyph}>⋯</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={s.scrim}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Dismiss menu"
          />
          <View style={s.card}>
            {items.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="menuitem"
                accessibilityLabel={item.label}
                onPress={() => {
                  close()
                  onSelect(item.id)
                }}
                style={({ pressed }) => [s.item, pressed && s.itemPressed, webPointer]}
              >
                <Text style={[s.label, item.danger === true && s.danger]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </>
  )
}
