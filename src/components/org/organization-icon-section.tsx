import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { OrganizationIcon } from '@/components/icons/nav-icons'
import { IconButton, IconPickerSheet } from '@/components/org/icon-picker-sheet'
import { SectionPanel, SettingRow, Toggle } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { typeStyle } from '@/components/ui/v4/type-styles'
import {
  iconValueLabel,
  isEmojiIconAllowedOf,
  resolvedIconValue,
  supportsOrganizationIcons,
} from '@/lib/icons'
import { useOrganizationRecord, useUpdateOrganization } from '@/lib/queries/auth'
import { useCan } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'
import { failedRunMessage } from '@/lib/user-error'

export const ALLOW_EMOJI_ICONS_LABEL = 'Allow Emoji Icons'

export const ALLOW_EMOJI_ICONS_HELP =
  'When this is off, everyone picks from the regular icons only, and an emoji already chosen shows the default icon.'

/**
 * Organization Settings → General → Icons: the organization's own icon (drawn
 * in the organization menu) and whether emoji icons are allowed for it and
 * its projects. Hidden on a control plane that does not serve these fields.
 * Both save at once through `PATCH /organizations/:id`.
 */
export function OrganizationIconSection({ orgId }: Readonly<{ orgId: string }>) {
  const canManage = useCan('organization', orgId, 'organization:manage')
  const organization = useOrganizationRecord(orgId)
  const update = useUpdateOrganization()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [switchDraft, setSwitchDraft] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!organization || !supportsOrganizationIcons(organization)) return null

  const isEmojiIconAllowed = switchDraft ?? isEmojiIconAllowedOf(organization)
  const icon = organization.icon ?? null
  const shown = resolvedIconValue(icon, isEmojiIconAllowed)
  const fallback = <OrganizationIcon size={20} color={colors.link} />

  const saveIcon = async (next: string | null): Promise<string | null> => {
    const result = await update.run({ organizationId: orgId, icon: next })
    return result.ok ? null : failedRunMessage(result, 'Could not save the icon.')
  }

  const onSwitch = async (next: boolean) => {
    setError(null)
    setSwitchDraft(next)
    const result = await update.run({ organizationId: orgId, isEmojiIconAllowed: next })
    setSwitchDraft(null)
    if (!result.ok) setError(failedRunMessage(result, 'Could not save the setting.'))
  }

  return (
    <SectionPanel
      title="Icons"
      hint={canManage ? 'Managers can change these' : 'Only managers can change these'}
    >
      <View style={styles.iconRow}>
        <IconButton
          icon={icon}
          isEmojiIconAllowed={isEmojiIconAllowed}
          fallback={fallback}
          onPress={canManage ? () => setPickerOpen(true) : null}
          accessibilityLabel={canManage ? 'Change the organization icon' : 'Organization icon'}
        />
        <View style={styles.iconCopy}>
          <Text style={styles.iconTitle}>Organization Icon</Text>
          <Text style={styles.iconSub}>
            {iconValueLabel(shown)}. Shown in the organization menu.
          </Text>
        </View>
      </View>
      <SettingRow label={ALLOW_EMOJI_ICONS_LABEL} description={ALLOW_EMOJI_ICONS_HELP}>
        <Toggle
          value={isEmojiIconAllowed}
          onValueChange={(next) => {
            void onSwitch(next)
          }}
          disabled={!canManage || update.isPending}
          accessibilityLabel={ALLOW_EMOJI_ICONS_LABEL}
        />
      </SettingRow>
      {error ? (
        <Text style={panelStyles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {pickerOpen ? (
        <IconPickerSheet
          value={icon}
          isEmojiIconAllowed={isEmojiIconAllowed}
          fallback={fallback}
          onClose={() => setPickerOpen(false)}
          onSave={saveIcon}
        />
      ) : null}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  iconTitle: { ...typeStyle('bodySemibold', 'body'), color: colors.text },
  iconSub: { ...typeStyle('body', 'footnote'), color: colors.textDim },
})
