import { Platform, StyleSheet } from 'react-native'
import { colors } from '@/lib/theme'
import { useColors } from '@/lib/theme-preference'
import type { Palette } from '@/lib/theme-palettes'

/**
 * The colours a primitive paints with.
 *
 * - Web: `colors` from `@/lib/theme`, whose entries are CSS variable
 *   references. They follow Light / Dark / Match computer, and a subtree
 *   pinned with `data-theme`, without a re-render.
 * - Phone: the palette for the scheme being painted, as real values.
 *
 * The hook is always called so the hook order never depends on the platform.
 */
export function usePalette(): Palette {
  const live = useColors()
  return Platform.OS === 'web' ? colors : live
}

type StyleFactory<T extends StyleSheet.NamedStyles<T>> = (p: Palette) => T

/**
 * Turn a style factory into a per-palette cache: the sheet is built once for
 * each palette object, so a re-render does not rebuild it.
 */
export function themedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: StyleFactory<T>,
): (p: Palette) => T {
  const cache = new WeakMap<Palette, T>()
  return (p) => {
    const hit = cache.get(p)
    if (hit) return hit
    const built = StyleSheet.create(factory(p))
    cache.set(p, built)
    return built
  }
}

/** True on a phone or a coarse pointer: controls grow to the touch size. */
export function useTouch(): boolean {
  if (Platform.OS !== 'web') return true
  const query = globalThis.matchMedia?.('(pointer: coarse)')
  return query?.matches ?? false
}
