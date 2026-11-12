import { Text, View } from 'react-native'
import { MonoText } from '@/components/ui'
import { ActionButton } from '@/components/ui/v4/action-button'
import { Sheet } from '@/components/ui/v4/sheet'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import type { CacheRecord } from '@/lib/instance-api'
import { CACHE_VARIABLES_NOTE } from '@/lib/v4/project-caches'

const styles = themedStyles((p) => ({
  list: { gap: 6 },
  note: { ...typeStyle('body', 'footnote'), color: p.text3 },
  name: { color: p.text },
}))

/** The names a cache sets for its Hosting Account's sites and apps. Values are never shown. */
export function CacheVariablesSheet({
  cache,
  onClose,
}: Readonly<{ cache: CacheRecord | null; onClose: () => void }>) {
  const s = styles(usePalette())
  return (
    <Sheet
      visible={cache !== null}
      onClose={onClose}
      title={cache === null ? 'Variables' : `Variables of ${cache.name}`}
      footer={<ActionButton label="Close" variant="primary" onPress={onClose} />}
    >
      <Text style={s.note}>{CACHE_VARIABLES_NOTE} Values are never shown here.</Text>
      <View style={s.list}>
        {(cache?.variables ?? []).map((name) => (
          <MonoText key={name} style={s.name}>
            {name}
          </MonoText>
        ))}
      </View>
    </Sheet>
  )
}
