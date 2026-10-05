import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ThemeModeIcon } from '@/components/icons/theme-icons'
import { headerMenuGroupStyles } from '@/components/header-menu-group-styles'
import { colors, webPointer } from '@/lib/theme'
import {
  setThemeMode,
  THEME_MODE_LABELS,
  THEME_MODES,
  themeSwitchSupported,
  useThemeMode,
  type ThemeMode,
} from '@/lib/theme-preference'

const ICON_SIZE = 16

/**
 * Light / Dark / Match computer. The choice is saved in this browser only.
 * Rendered where the screens can follow it (the browser app), so it is not
 * drawn on the phone app yet.
 *
 * `header` is a three-icon group for the wide header; `menu` is a list of
 * rows for the account menu on narrow screens. Both are one radio group:
 * exactly one option is checked, and Match computer is the default.
 */
export function ThemeSwitch({ variant }: Readonly<{ variant: 'header' | 'menu' }>) {
  const mode = useThemeMode()
  if (!themeSwitchSupported()) return null

  if (variant === 'menu') {
    return (
      <View accessibilityRole="radiogroup" accessibilityLabel="Theme">
        <Text style={headerMenuGroupStyles.menuHeading}>Theme</Text>
        {THEME_MODES.map((option) => (
          <MenuRow key={option} option={option} checked={option === mode} />
        ))}
      </View>
    )
  }

  return (
    <View
      style={styles.group}
      accessibilityRole="radiogroup"
      accessibilityLabel="Theme"
    >
      {THEME_MODES.map((option) => (
        <HeaderButton key={option} option={option} checked={option === mode} />
      ))}
    </View>
  )
}

function HeaderButton({
  option,
  checked,
}: Readonly<{ option: ThemeMode; checked: boolean }>) {
  const label = THEME_MODE_LABELS[option]
  return (
    <Pressable
      onPress={() => setThemeMode(option)}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      // Web hover tooltip; native ignores the unknown prop.
      {...({ title: label } as object)}
      style={({ pressed }) => [
        styles.button,
        checked && styles.buttonChecked,
        pressed && headerMenuGroupStyles.itemPressed,
        webPointer,
      ]}
    >
      <ThemeModeIcon
        mode={option}
        size={ICON_SIZE}
        color={checked ? colors.link : colors.textMuted}
      />
    </Pressable>
  )
}

function MenuRow({
  option,
  checked,
}: Readonly<{ option: ThemeMode; checked: boolean }>) {
  const label = THEME_MODE_LABELS[option]
  return (
    <Pressable
      onPress={() => setThemeMode(option)}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      style={({ pressed }) => [
        headerMenuGroupStyles.menuItem,
        checked && headerMenuGroupStyles.menuItemActive,
        pressed && headerMenuGroupStyles.itemPressed,
        webPointer,
      ]}
    >
      <ThemeModeIcon
        mode={option}
        size={ICON_SIZE}
        color={checked ? colors.link : colors.textMuted}
      />
      <Text
        style={[
          headerMenuGroupStyles.menuItemLabel,
          checked && headerMenuGroupStyles.menuItemLabelActive,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 2,
    padding: 2,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: 8,
  },
  button: {
    width: 30,
    height: 30,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonChecked: {
    backgroundColor: colors.bgActive,
  },
})
