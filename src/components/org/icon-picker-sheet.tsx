import { useState, type ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { ResourceIcon } from '@/components/icons/picked-icon'
import { IconKeyGlyph } from '@/components/icons/icon-key-glyphs'
import { TextField } from '@/components/ui'
import { ActionButton, Sheet, UnderlineTabs } from '@/components/ui/v4'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { typeStyle } from '@/components/ui/v4/type-styles'
import {
  filterEmoji,
  ICON_KEY_LABELS,
  ICON_KEYS,
  iconValueLabel,
  isEmojiIcon,
  pastedEmojiProblem,
} from '@/lib/icons'
import { webPointer } from '@/lib/theme'

const CELL = 52

const styles = themedStyles((p) => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: p.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellHover: { backgroundColor: p.surface3 },
  cellOn: { borderColor: p.accent, backgroundColor: p.accentSoft },
  emoji: { fontSize: 24, lineHeight: 30, textAlign: 'center' },
  none: { ...typeStyle('body', 'footnote'), color: p.text3, paddingVertical: 16 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  previewText: { ...typeStyle('bodySemibold', 'footnote'), color: p.text2 },
  error: { ...typeStyle('body', 'footnote'), color: p.bad },
  button: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: p.sep,
    backgroundColor: p.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonHover: { borderColor: p.accent, backgroundColor: p.accentSoft },
  buttonDisabled: { opacity: 0.6 },
}))

/**
 * The icon as a button that opens the picker (the approved layout's icon box
 * beside the name). Read-only viewers get the same box without a press.
 */
export function IconButton({
  icon,
  isEmojiIconAllowed,
  fallback,
  onPress,
  accessibilityLabel,
}: Readonly<{
  icon: string | null
  isEmojiIconAllowed: boolean
  fallback: ReactNode
  /** Opens the picker; null draws the icon read-only. */
  onPress: (() => void) | null
  accessibilityLabel: string
}>) {
  const p = usePalette()
  const s = styles(p)
  const glyph = (
    <ResourceIcon
      icon={icon}
      isEmojiIconAllowed={isEmojiIconAllowed}
      size={20}
      color={p.link}
      fallback={fallback}
    />
  )
  if (!onPress) {
    return (
      <View style={[s.button, s.buttonDisabled]} accessibilityLabel={accessibilityLabel}>
        {glyph}
      </View>
    )
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        s.button,
        (pressed || hovered) && s.buttonHover,
        webPointer,
      ]}
    >
      {glyph}
    </Pressable>
  )
}

type Tab = 'icons' | 'emoji'

function Cell({
  label,
  checked,
  onPress,
  children,
}: Readonly<{ label: string; checked: boolean; onPress: () => void; children: ReactNode }>) {
  const s = styles(usePalette())
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        s.cell,
        (pressed || hovered) && s.cellHover,
        checked && s.cellOn,
        webPointer,
      ]}
    >
      {children}
    </Pressable>
  )
}

function IconGrid({
  draft,
  onPick,
}: Readonly<{ draft: string | null; onPick: (icon: string) => void }>) {
  const p = usePalette()
  const s = styles(p)
  return (
    <View style={s.grid} accessibilityRole="radiogroup" accessibilityLabel="Icons">
      {ICON_KEYS.map((key) => (
        <Cell
          key={key}
          label={ICON_KEY_LABELS[key]}
          checked={draft === key}
          onPress={() => onPick(key)}
        >
          <IconKeyGlyph iconKey={key} size={22} color={draft === key ? p.link : p.text2} />
        </Cell>
      ))}
    </View>
  )
}

function EmojiPane({
  draft,
  onPick,
}: Readonly<{ draft: string | null; onPick: (icon: string) => void }>) {
  const s = styles(usePalette())
  const [query, setQuery] = useState('')
  const [pasted, setPasted] = useState('')
  const shown = filterEmoji(query)
  const pasteProblem = pastedEmojiProblem(pasted)
  return (
    <>
      <TextField
        label="Filter Emoji"
        value={query}
        onChangeText={setQuery}
        placeholder="Search by name, like rocket or heart"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Filter emoji"
      />
      <View style={s.grid} accessibilityRole="radiogroup" accessibilityLabel="Emoji">
        {shown.map((choice) => (
          <Cell
            key={choice.emoji}
            label={choice.name}
            checked={draft === choice.emoji}
            onPress={() => onPick(choice.emoji)}
          >
            <Text style={s.emoji}>{choice.emoji}</Text>
          </Cell>
        ))}
        {shown.length === 0 ? (
          <Text style={s.none}>No emoji match. Paste one below instead.</Text>
        ) : null}
      </View>
      <TextField
        label="Paste an Emoji"
        value={pasted}
        onChangeText={(value) => {
          setPasted(value)
          const trimmed = value.trim()
          if (isEmojiIcon(trimmed)) onPick(trimmed)
        }}
        hint="Any single emoji works, including ones not shown above."
        error={pasteProblem}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Paste an emoji"
      />
    </>
  )
}

export type IconPickerSheetProps = Readonly<{
  /** The stored icon: a key, an emoji or null. */
  value: string | null
  /** False hides the Emoji tab entirely; the regular icons are always there. */
  isEmojiIconAllowed: boolean
  /** The surface's default glyph, for the preview of "Default". */
  fallback: ReactNode
  onClose: () => void
  /**
   * Saves the chosen icon (null resets to the default). Resolves to the
   * error to show, or null once saved; the sheet closes on success.
   */
  onSave: (icon: string | null) => Promise<string | null>
}>

/**
 * The one icon picker, for projects and organizations: the regular icons, an
 * Emoji tab (common emoji with a filter, plus a field to paste any single
 * emoji) while the organization allows them, and Reset to Default. Nothing is
 * saved until Use Icon. Mount it only while it is open, so it starts from the
 * stored value each time.
 */
export function IconPickerSheet({
  value,
  isEmojiIconAllowed,
  fallback,
  onClose,
  onSave,
}: IconPickerSheetProps) {
  const p = usePalette()
  const s = styles(p)
  // A stored emoji while emoji are off draws as the default, so it starts as one.
  const start = isEmojiIconAllowed || !isEmojiIcon(value) ? value : null
  const [draft, setDraft] = useState<string | null>(start)
  const [tab, setTab] = useState<Tab>(isEmojiIconAllowed && isEmojiIcon(start) ? 'emoji' : 'icons')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const showEmoji = isEmojiIconAllowed && tab === 'emoji'

  const pick = (icon: string | null) => {
    setDraft(icon)
    setError(null)
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    const problem = await onSave(draft)
    setSaving(false)
    if (problem) {
      setError(problem)
      return
    }
    onClose()
  }

  return (
    <Sheet
      visible
      onClose={saving ? () => undefined : onClose}
      title="Choose an Icon"
      footer={
        <>
          <ActionButton
            label="Reset to Default"
            variant="quiet"
            onPress={() => pick(null)}
            disabled={draft === null || saving}
          />
          <ActionButton label="Cancel" variant="quiet" onPress={onClose} disabled={saving} />
          <ActionButton
            label="Use Icon"
            variant="primary"
            busy={saving}
            busyLabel="Saving…"
            disabled={draft === value}
            onPress={() => {
              void save()
            }}
          />
        </>
      }
    >
      {isEmojiIconAllowed ? (
        <UnderlineTabs
          tabs={[
            { key: 'icons', label: 'Icons' },
            { key: 'emoji', label: 'Emoji' },
          ]}
          value={tab}
          onChange={(key) => setTab(key as Tab)}
          ariaLabel="Icon kinds"
        />
      ) : null}
      {showEmoji ? (
        <EmojiPane draft={draft} onPick={pick} />
      ) : (
        <IconGrid draft={draft} onPick={pick} />
      )}
      <View style={s.preview}>
        <ResourceIcon
          icon={draft}
          isEmojiIconAllowed={isEmojiIconAllowed}
          size={20}
          color={p.link}
          fallback={fallback}
        />
        <Text style={s.previewText}>{iconValueLabel(draft)}</Text>
      </View>
      {error ? (
        <Text style={s.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </Sheet>
  )
}
