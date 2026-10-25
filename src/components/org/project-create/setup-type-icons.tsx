import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { ComposeHostingIcon, ComposeVisualIcon } from '@/components/org/compose-view-icons'
import type {
  SetupChoice,
  SetupTypeOption,
} from '@/components/org/project-create/setup-types'
import { chrome, colors, webPointer } from '@/lib/theme'

type IconProps = Readonly<{
  size?: number
  color: string
}>

/** Quill / feather — Compose is a blank file you write. */
function ComposeFeatherGlyph({ size = 22, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12.67 19a2 2 0 0 0 1.416-.588l6.154-6.172a6 6 0 0 0-8.49-8.49L5.586 9.913A2 2 0 0 0 5 11.328V18a1 1 0 0 0 1 1z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M16 8 2 22"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
      <Path
        d="M17.5 15H9"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
    </Svg>
  )
}

/**
 * Branch line with two commit nodes — the stack starts from a Git repository.
 *
 * Deliberately a *branch*, not a provider mark: the card offers whatever the
 * organization has connected (GitHub, GitLab, a deploy key), so stamping one
 * vendor's logo on it would promise the wrong thing.
 */
function RepositoryBranchGlyph({ size = 22, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.75 8.25v10"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
      />
      <Circle cx="6.75" cy="5.25" r="2.5" stroke={color} strokeWidth={1.75} />
      <Circle cx="17.25" cy="5.25" r="2.5" stroke={color} strokeWidth={1.75} />
      <Circle cx="6.75" cy="18.75" r="2.5" stroke={color} strokeWidth={1.75} />
      <Path
        d="M17.25 7.75v2.5a5 5 0 0 1-5 5H9.25"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

/** Page layout blocks — start from a catalog template. */
function TemplateLayoutGlyph({ size = 22, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x="3.75"
        y="3.75"
        width="16.5"
        height="6.5"
        rx="1.25"
        stroke={color}
        strokeWidth={1.75}
      />
      <Rect
        x="3.75"
        y="13.75"
        width="8.5"
        height="6.5"
        rx="1.25"
        stroke={color}
        strokeWidth={1.75}
      />
      <Rect
        x="14.75"
        y="13.75"
        width="5.5"
        height="6.5"
        rx="1.25"
        stroke={color}
        strokeWidth={1.75}
      />
    </Svg>
  )
}

/** Cylinder — a service that is provisioned for you. */
function ManagedCylinderGlyph({ size = 22, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4.5 6.75c0 1.657 3.358 3 7.5 3s7.5-1.343 7.5-3-3.358-3-7.5-3-7.5 1.343-7.5 3Z"
        stroke={color}
        strokeWidth={1.75}
      />
      <Path
        d="M4.5 6.75v10.5c0 1.657 3.358 3 7.5 3s7.5-1.343 7.5-3V6.75"
        stroke={color}
        strokeWidth={1.75}
      />
      <Path
        d="M4.5 12c0 1.657 3.358 3 7.5 3s7.5-1.343 7.5-3"
        stroke={color}
        strokeWidth={1.75}
      />
    </Svg>
  )
}

/** Leading glyph for a project type choice card. Never emoji. */
function SetupTypeGlyph({
  choice,
  size = 22,
  color,
}: Readonly<{
  choice: SetupChoice
  size?: number
  color: string
}>) {
  if (choice === 'managed') {
    return <ManagedCylinderGlyph size={size} color={color} />
  }
  if (choice === 'template') {
    return <TemplateLayoutGlyph size={size} color={color} />
  }
  if (choice === 'repository') {
    return <RepositoryBranchGlyph size={size} color={color} />
  }
  // Services reuses the compose surface's own Services tab glyph, so the card
  // and the tab it lands on read as the same thing.
  if (choice === 'services') {
    return <ComposeVisualIcon size={size} color={color} />
  }
  // Hosting upload reuses the Hosting tab glyph, for the same reason.
  if (choice === 'hosting') {
    return <ComposeHostingIcon size={size} color={color} />
  }
  return <ComposeFeatherGlyph size={size} color={color} />
}

/**
 * Setup type row: a glyph in a rounded well on the left, the name and a
 * one-line description on the right. Full width; the column stacks them.
 */
export function SetupTypeChoiceCard({
  option,
  selected,
  disabled = false,
  onPress,
}: Readonly<{
  option: SetupTypeOption
  selected: boolean
  disabled?: boolean
  onPress: () => void
}>) {
  const iconColor = selected ? chrome.accent : colors.textBody
  return (
    <Pressable
      style={[
        styles.tile,
        webPointer,
        selected && styles.tileSelected,
        disabled && styles.tileDisabled,
      ]}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={option.label}
      accessibilityHint={option.description}
    >
      <View
        style={[styles.iconWell, selected && styles.iconWellSelected]}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        <SetupTypeGlyph choice={option.choice} size={26} color={iconColor} />
      </View>
      <View style={styles.text}>
        <Text style={[styles.label, selected && styles.labelSelected]}>
          {option.label}
        </Text>
        <Text style={styles.description}>{option.description}</Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  tile: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 14,
    backgroundColor: colors.bgSecondary,
  },
  tileSelected: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  tileDisabled: {
    opacity: 0.55,
  },
  iconWell: {
    flexShrink: 0,
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  iconWellSelected: {
    borderColor: chrome.accent,
    backgroundColor: 'transparent',
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  labelSelected: {
    color: colors.link,
  },
  description: {
    color: colors.textFaint,
    fontSize: 12.5,
    lineHeight: 17,
  },
})
