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
import { moveInRadioGroup, type RadioGroupKeyEvent } from '@/lib/radio-group-keys'
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
      <View
        style={[s.button, s.buttonDisabled]}
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
      >
        {glyph}
      </View>
    )
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      // The box is 40 x 40; the press area reaches 44 x 44.
      hitSlop={2}
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
  focusable,
  onPress,
  children,
}: Readonly<{
  label: string
  checked: boolean
  /** The group's one tab stop: the checked cell, else the first. */
  focusable: boolean
  onPress: () => void
  children: ReactNode
}>) {
  const s = styles(usePalette())
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      // React Native Web ignores accessibilityState, so the web needs aria-checked.
      aria-checked={checked}
      accessibilityLabel={label}
      onPress={onPress}
      {...({ title: label, tabIndex: focusable ? 0 : -1 } as object)}
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

/** One radio group of cells with a single tab stop. */
function RadioGrid<T extends string>({
  label,
  values,
  draft,
  onPick,
  cell,
}: Readonly<{
  label: string
  values: readonly T[]
  draft: string | null
  onPick: (value: T) => void
  cell: (value: T) => Readonly<{ name: string; glyph: ReactNode }>
}>) {
  const s = styles(usePalette())
  const checkedAt = draft === null ? -1 : (values as readonly string[]).indexOf(draft)
  const stop = Math.max(checkedAt, 0)
  // Arrow keys, Home and End move between the cells and pick the one reached (web).
  const onKeyDown = (event: RadioGroupKeyEvent) => {
    const next = moveInRadioGroup(event)
    const value = next === null ? undefined : values[next]
    if (value !== undefined) onPick(value)
  }
  return (
    <View
      style={s.grid}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      {...({ onKeyDown } as object)}
    >
      {values.map((value, index) => {
        const { name, glyph } = cell(value)
        return (
          <Cell
            key={value}
            label={name}
            checked={value === draft}
            focusable={index === stop}
            onPress={() => onPick(value)}
          >
            {glyph}
          </Cell>
        )
      })}
    </View>
  )
}

function IconGrid({
  draft,
  onPick,
}: Readonly<{ draft: string | null; onPick: (icon: string) => void }>) {
  const p = usePalette()
  return (
    <RadioGrid
      label="Icons"
      values={ICON_KEYS}
      draft={draft}
      onPick={onPick}
      cell={(key) => ({
        name: ICON_KEY_LABELS[key],
        glyph: <IconKeyGlyph iconKey={key} size={22} color={draft === key ? p.link : p.text2} />,
      })}
    />
  )
}

function EmojiPane({
  draft,
  pasted,
  onPick,
  onPaste,
}: Readonly<{
  draft: string | null
  /** The paste field's text; the sheet owns it so a bad paste can hold Use Icon. */
  pasted: string
  onPick: (icon: string) => void
  onPaste: (text: string) => void
}>) {
  const s = styles(usePalette())
  const [query, setQuery] = useState('')
  const shown = filterEmoji(query)
  const names = new Map(shown.map((choice) => [choice.emoji, choice.name]))
  return (
    <>
      <TextField
        label="Filter emoji"
        value={query}
        onChangeText={setQuery}
        placeholder="Search by name, like rocket or heart"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Filter emoji"
      />
      {shown.length > 0 ? (
        <RadioGrid
          label="Emoji"
          values={shown.map((choice) => choice.emoji)}
          draft={draft}
          onPick={onPick}
          cell={(emoji) => ({
            name: names.get(emoji) ?? emoji,
            glyph: <Text style={s.emoji}>{emoji}</Text>,
          })}
        />
      ) : (
        <Text style={s.none}>No emoji match. Paste one below instead.</Text>
      )}
      <TextField
        label="Paste an emoji"
        value={pasted}
        onChangeText={onPaste}
        hint="Any single emoji works, including ones not shown above."
        error={pastedEmojiProblem(pasted)}
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
  const [pasted, setPasted] = useState('')
  const showEmoji = isEmojiIconAllowed && tab === 'emoji'
  const pasteInvalid = pastedEmojiProblem(pasted) !== null

  // Picking a cell or Reset to Default empties the paste field.
  const pick = (icon: string | null) => {
    setDraft(icon)
    setPasted('')
    setError(null)
  }

  const paste = (text: string) => {
    setPasted(text)
    setError(null)
    const trimmed = text.trim()
    if (isEmojiIcon(trimmed)) setDraft(trimmed)
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
            disabled={draft === value || pasteInvalid}
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
        <EmojiPane draft={draft} pasted={pasted} onPick={pick} onPaste={paste} />
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
