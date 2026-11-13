import { Text, View } from 'react-native'

export type BadgeTone = 'ok' | 'muted' | 'danger' | 'pending' | 'info'

// Whole class names, never built from parts: the class scanner reads the source
// text. Colours come from the token theme (`global.css`), never from hex.
const toneBox: Record<BadgeTone, string> = {
  ok: 'border-ok bg-ok-soft',
  muted: 'border-border-chip bg-bg-secondary',
  danger: 'border-error bg-transparent',
  pending: 'border-pending bg-transparent',
  info: 'border-blue bg-bg-active-blue',
}

const toneText: Record<BadgeTone, string> = {
  ok: 'text-ok',
  muted: 'text-text-muted',
  danger: 'text-error-text',
  pending: 'text-pending',
  info: 'text-command',
}

/**
 * Uppercase status pill. Tone is never the only cue — the label carries
 * the state in text (MASTER: no color-only status).
 */
export function Badge({
  label,
  tone = 'muted',
}: Readonly<{
  label: string
  tone?: BadgeTone
}>) {
  return (
    <View className={`self-start rounded-[6px] border px-[8px] py-[2px] ${toneBox[tone]}`}>
      <Text className={`text-[11px] font-bold uppercase tracking-[0.4px] ${toneText[tone]}`}>
        {label}
      </Text>
    </View>
  )
}
