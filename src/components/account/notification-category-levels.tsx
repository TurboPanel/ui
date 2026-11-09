import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Button, Select, SettingRow, TextLink, type SelectOption } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { NotificationLevel, NotificationPreferenceRow } from '@/lib/instance-api'
import {
  categoryInEffectWords,
  LEVEL_LABEL,
  LEVEL_OPTIONS,
  preferenceErrorCopy,
  rowSubjectWords,
  rowTargetWords,
  type CategoryPicture,
  type PreferenceNames,
} from '@/lib/notification-preferences'
import {
  useDeleteNotificationPreference,
  usePutNotificationPreference,
} from '@/lib/queries/notification-preferences'
import { colors, spacing } from '@/lib/theme'

/** One stored setting as a line: what it sets, an optional second line, and Remove. */
export function PreferenceRowLine({
  row,
  title,
  detail,
}: Readonly<{ row: NotificationPreferenceRow; title: string; detail?: string }>) {
  const remove = useDeleteNotificationPreference()
  const [message, setMessage] = useState<string | null>(null)
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        {detail ? <Text style={panelStyles.muted}>{detail}</Text> : null}
        {message ? <Text style={panelStyles.error}>{message}</Text> : null}
      </View>
      <Button
        label="Remove"
        size="sm"
        variant="ghost"
        busy={remove.isPending}
        accessibilityLabel={detail ? `Remove ${title}, ${detail}` : `Remove ${title}`}
        onPress={() => {
          setMessage(null)
          void remove.run({ id: row.id, organizationId: row.organizationId }).then((result) => {
            if (!result.ok) setMessage(preferenceErrorCopy(result.cause))
          })
        }}
      />
    </View>
  )
}

const LEVEL_SELECT_OPTIONS: SelectOption[] = LEVEL_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
}))

/**
 * Organization-level settings per category. The picker sets a category for
 * every channel. A setting that names the category together with one channel
 * kind or one channel (an email unsubscribe writes one) wins over the picker,
 * so each is listed under its category with Remove, and a category whose
 * levels are not what the picker says spells out what is in effect.
 */
export function CategoryLevels({
  organizationId,
  pictures,
  names,
}: Readonly<{
  organizationId: string
  pictures: readonly CategoryPicture[]
  names: PreferenceNames
}>) {
  const router = useRouter()
  const put = usePutNotificationPreference()
  const remove = useDeleteNotificationPreference()
  const [message, setMessage] = useState<string | null>(null)
  const busy = put.isPending || remove.isPending
  const done = (result: { ok: boolean; cause?: unknown }) => {
    if (!result.ok) setMessage(preferenceErrorCopy(result.cause))
  }
  const setCategory = (picture: CategoryPicture, next: string | null) => {
    setMessage(null)
    if (next === null) {
      if (picture.own) void remove.run({ id: picture.own.id, organizationId }).then(done)
      return
    }
    void put
      .run({
        organizationId,
        categoryCode: picture.code,
        kind: null,
        level: next as NotificationLevel,
      })
      .then(done)
  }
  const decidedElsewhere = pictures.some((p) =>
    p.inEffect.some((k) => k.differs && k.source === 'global')
  )
  return (
    <View style={styles.block}>
      <Text style={styles.subheading}>Categories</Text>
      <Text style={panelStyles.muted}>
        A category set here wins over the levels above for every channel in this organization. A
        setting for one channel kind or one channel in a category wins over that; unsubscribing from
        an email adds one. Each is listed under its category: remove it to follow the category
        again.
      </Text>
      {pictures.map((picture) => (
        <View key={picture.code} style={styles.category}>
          <SettingRow label={picture.name}>
            <Select
              value={picture.own?.level ?? null}
              options={LEVEL_SELECT_OPTIONS}
              placeholder="Same as Above"
              noneLabel="Same as Above"
              disabled={busy}
              accessibilityLabel={
                picture.differs
                  ? `${picture.name} level. In effect: ${categoryInEffectWords(picture)}`
                  : `${picture.name} level`
              }
              onChange={(next) => setCategory(picture, next)}
            />
          </SettingRow>
          {picture.differs ? (
            <Text style={panelStyles.muted}>In effect: {categoryInEffectWords(picture)}</Text>
          ) : null}
          {picture.targeted.map((row) => (
            <PreferenceRowLine
              key={row.id}
              row={row}
              title={`${rowTargetWords(row, names)}: ${LEVEL_LABEL[row.level]}`}
              detail={`${picture.name} only`}
            />
          ))}
        </View>
      ))}
      {decidedElsewhere ? (
        <TextLink
          label="Open the Settings for Every Organization"
          size="sm"
          onPress={() => router.push('/account/notifications')}
        />
      ) : null}
      {message ? <Text style={panelStyles.error}>{message}</Text> : null}
    </View>
  )
}

/**
 * The settings at one scope that no control there shows (one event, one
 * channel for every event, and anything else made through the API), so they
 * can still be seen and removed.
 */
export function OtherSettings({
  title,
  rows,
  names,
}: Readonly<{
  title: string
  rows: readonly NotificationPreferenceRow[]
  names: PreferenceNames
}>) {
  if (rows.length === 0) return null
  return (
    <View style={styles.block}>
      <Text style={styles.subheading}>{title}</Text>
      <Text style={panelStyles.muted}>
        Each of these still applies and wins over a wider setting. Remove one to inherit again.
      </Text>
      {rows.map((row) => (
        <PreferenceRowLine
          key={row.id}
          row={row}
          title={`${rowSubjectWords(row, names)}: ${LEVEL_LABEL[row.level]}`}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.sm,
  },
  subheading: {
    color: colors.textTitle,
    fontSize: 14,
    fontWeight: '600',
  },
  category: {
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: colors.textBody,
    fontSize: 13,
  },
})
