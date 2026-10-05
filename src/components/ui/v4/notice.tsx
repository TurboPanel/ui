import { type ReactNode } from 'react'
import { Text, View } from 'react-native'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { RADIUS } from '@/lib/v4/ui-scale'

export type NoticeTone = 'info' | 'ok' | 'busy' | 'warn' | 'bad'

const styles = themedStyles((p) => ({
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: p.sep,
    backgroundColor: p.surface,
  },
  compact: { padding: 12 },
  ok: { backgroundColor: p.okSoft, borderColor: p.okLine },
  busy: { backgroundColor: p.busySoft, borderColor: p.busyLine },
  warn: { backgroundColor: p.warnSoft, borderColor: p.warnLine },
  bad: { backgroundColor: p.badSoft, borderColor: p.badLine },
  main: { flex: 1, minWidth: 0, gap: 4 },
  title: { ...typeStyle('bodySemibold', 'body'), color: p.text },
  titleCompact: { ...typeStyle('bodySemibold', 'subhead') },
  body: { ...typeStyle('body', 'subhead'), color: p.text2 },
  errorLine: {
    ...typeStyle('mono', 'mono'),
    color: p.bad,
    backgroundColor: p.badSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.row,
    marginTop: 4,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 },
}))

/**
 * A statement that belongs in the page flow, tinted by tone. Use it for a
 * problem, a warning or a result; do not use a sheet for a message that only
 * explains the content under it.
 *
 * `errorLine` is the one raw line of what went wrong ("Build stopped with an
 * error"), shown in code type on a red tint, selectable so it can be copied.
 * A `bad` notice is announced as an alert. The notice never repeats a status
 * word that a chip beside it already says.
 */
export function Notice({
  tone = 'info',
  title,
  body,
  errorLine,
  actions,
  leading,
  compact = false,
}: Readonly<{
  tone?: NoticeTone
  title?: string
  body?: string
  errorLine?: string
  actions?: ReactNode
  /** A status chip or icon before the text. */
  leading?: ReactNode
  compact?: boolean
}>) {
  const s = styles(usePalette())
  const toneStyle = tone === 'info' ? undefined : s[tone]
  const spoken = [title, body, errorLine]
    .filter((part): part is string => Boolean(part))
    .map((part) => part.replace(/[.\s]+$/, ''))
    .join('. ')
  return (
    <View
      accessibilityRole={tone === 'bad' ? 'alert' : 'summary'}
      accessibilityLabel={spoken}
      style={[s.notice, compact && s.compact, toneStyle]}
    >
      {leading}
      <View style={s.main}>
        {title ? <Text style={[s.title, compact && s.titleCompact]}>{title}</Text> : null}
        {body ? <Text style={s.body}>{body}</Text> : null}
        {errorLine ? (
          <Text selectable style={s.errorLine}>
            {errorLine}
          </Text>
        ) : null}
        {actions ? <View style={s.actions}>{actions}</View> : null}
      </View>
    </View>
  )
}
