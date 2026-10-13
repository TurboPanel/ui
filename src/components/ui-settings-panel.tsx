import { useState, type ReactNode } from 'react'
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { HeaderChevron } from '@/components/header-chevron'
import { headerMenuGroupStyles } from '@/components/header-menu-group-styles'
import { PageLayoutIcon, SlidersMenuIcon } from '@/components/icons/account-menu-icons'
import { ThemeModeIcon } from '@/components/icons/theme-icons'
import {
  PAGE_WIDTH_MODES,
  setPageWidth,
  usePageWidth,
  type PageWidthMode,
} from '@/lib/page-width'
import { colors, webPointer } from '@/lib/theme'
import {
  setThemeMode,
  THEME_MODE_LABELS,
  THEME_MODES,
  themeSwitchSupported,
  useThemeMode,
} from '@/lib/theme-preference'

/** Page layout choices only make sense where a content column can be placed. */
export const PAGE_LAYOUT_MIN_WIDTH = 1024

const PAGE_LAYOUT_LABELS: Readonly<Record<PageWidthMode, string>> = {
  left: 'Left',
  center: 'Center',
  wide: 'Wide',
}

const PAGE_LAYOUT_HINTS: Readonly<Record<PageWidthMode, string>> = {
  left: 'Left: contained, aligned left',
  center: 'Center: contained, centered',
  wide: 'Wide: content fills the window',
}

type Choice<T extends string> = Readonly<{
  value: T
  /** Visible text. */
  label: string
  /** Accessible name; defaults to the label. */
  name?: string
  hint?: string
  icon: (color: string) => ReactNode
}>

/**
 * One radio group of equal buttons. Exactly one option is checked and only it
 * is a tab stop; the arrow keys move the choice and Home/End jump to the first/last (web).
 */
function ChoiceRow<T extends string>({
  label,
  choices,
  value,
  onChange,
}: Readonly<{
  label: string
  choices: readonly Choice<T>[]
  value: T
  onChange: (next: T) => void
}>) {
  const onKeyDown = (event: {
    key: string
    target: unknown
    currentTarget: unknown
    preventDefault: () => void
  }) => {
    const jump = event.key === 'Home' || event.key === 'End'
    let step = 0
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') step = 1
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') step = -1
    if (step === 0 && !jump) return
    const group = event.currentTarget as HTMLElement
    const radios = Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]'))
    const at = radios.indexOf(event.target as HTMLElement)
    if (at < 0) return
    event.preventDefault()
    let next = (at + step + radios.length) % radios.length
    if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = radios.length - 1
    radios[next]?.focus()
    const choice = choices[next]
    if (choice) onChange(choice.value)
  }

  return (
    <View
      style={styles.segment}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      {...({ onKeyDown } as object)}
    >
      {choices.map((choice) => {
        const checked = choice.value === value
        return (
          <Pressable
            key={choice.value}
            onPress={() => onChange(choice.value)}
            accessibilityRole="radio"
            accessibilityLabel={choice.name ?? choice.label}
            accessibilityState={{ checked }}
            // Web hover tooltip and one tab stop per group; native ignores both.
            {...({ title: choice.hint ?? choice.name ?? choice.label, tabIndex: checked ? 0 : -1 } as object)}
            style={({ pressed }) => [
              styles.choice,
              checked && styles.choiceChecked,
              pressed && headerMenuGroupStyles.itemPressed,
              webPointer,
            ]}
          >
            {choice.icon(checked ? colors.link : colors.textDim)}
            <Text style={[styles.choiceLabel, checked && styles.choiceLabelChecked]} numberOfLines={1}>
              {choice.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const THEME_CHOICES: readonly Choice<(typeof THEME_MODES)[number]>[] = THEME_MODES.map(
  (mode) => ({
    value: mode,
    label: mode === 'system' ? 'System' : THEME_MODE_LABELS[mode],
    name: THEME_MODE_LABELS[mode],
    icon: (color: string) => <ThemeModeIcon mode={mode} size={18} color={color} />,
  }),
)

const LAYOUT_CHOICES: readonly Choice<PageWidthMode>[] = PAGE_WIDTH_MODES.map((mode) => ({
  value: mode,
  label: PAGE_LAYOUT_LABELS[mode],
  hint: PAGE_LAYOUT_HINTS[mode],
  icon: (color: string) => <PageLayoutIcon mode={mode} size={16} color={color} />,
}))

/**
 * "UI settings" row for the profile menu: collapsed by default, opens to a
 * Theme row (Light, Dark, System) and, on wide web windows, a Page layout row
 * (Left, Center, Wide). Both choices are saved in this browser only.
 */
export function UiSettings() {
  const [open, setOpen] = useState(false)
  const { width } = useWindowDimensions()
  const themeMode = useThemeMode()
  const pageWidth = usePageWidth()
  const showTheme = themeSwitchSupported()
  // The phone shell already passes maxWidth=width, so the choice does nothing there.
  const showLayout = Platform.OS === 'web' && width >= PAGE_LAYOUT_MIN_WIDTH
  if (!showTheme && !showLayout) return null

  return (
    <>
      <Pressable
        style={({ pressed }) => [
          styles.toggle,
          pressed && headerMenuGroupStyles.itemPressed,
          webPointer,
        ]}
        onPress={() => setOpen((current) => !current)}
        accessibilityRole="button"
        accessibilityLabel="UI settings"
        accessibilityState={{ expanded: open }}
      >
        <SlidersMenuIcon size={16} color={colors.textDim} />
        <Text style={styles.toggleLabel} numberOfLines={1}>
          UI settings
        </Text>
        <HeaderChevron color={open ? colors.text : colors.textDim} open={open} />
      </Pressable>
      {open ? (
        <View style={styles.panel}>
          {showTheme ? (
            <ChoiceRow
              label="Theme"
              choices={THEME_CHOICES}
              value={themeMode}
              onChange={setThemeMode}
            />
          ) : null}
          {showLayout ? (
            <ChoiceRow
              label="Page layout"
              choices={LAYOUT_CHOICES}
              value={pageWidth}
              onChange={setPageWidth}
            />
          ) : null}
        </View>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 36,
    paddingHorizontal: 8,
    paddingVertical: 9,
    borderRadius: 8,
  },
  toggleLabel: {
    flex: 1,
    minWidth: 0,
    color: colors.textChip,
    fontSize: 13,
    fontWeight: '600',
  },
  panel: {
    gap: 2,
  },
  segment: {
    flexDirection: 'row',
    gap: 2,
  },
  choice: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 6,
    paddingVertical: 9,
    borderRadius: 8,
  },
  choiceChecked: {
    backgroundColor: colors.accentSoft,
  },
  choiceLabel: {
    color: colors.textChip,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  choiceLabelChecked: {
    color: colors.text,
  },
})
