import { useState, type ReactNode } from 'react'
import { ProjectDefaultGlyph } from '@/components/org/project-tile'
import { IconPickerSheet } from '@/components/org/icon-picker-sheet'
import { emojiIconsOffered, isEmojiIconAllowedOf, supportsOrganizationIcons } from '@/lib/icons'
import { useOrganizationRecord } from '@/lib/queries/auth'
import { colors } from '@/lib/theme'

/** The icon button beside the project name: what it draws and what it opens. */
export type NewProjectIconField = Readonly<{
  value: string | null
  isEmojiIconAllowed: boolean
  fallback: ReactNode
  onChoose: () => void
}>

/**
 * The New Project form's icon: kept in the form until Create, which sends it
 * with the project (`createIconField`). The picker offers emoji only when the
 * organization does (`emojiIconsOffered`); Use Icon just keeps the choice.
 */
export function useNewProjectIcon(orgId: string): Readonly<{
  icon: string | null
  /**
   * The name field's icon button for the chosen start type, or undefined: no
   * button for a managed database (it keeps the managed icon) or on a
   * control plane without organization icons.
   */
  fieldFor: (type: string | null | undefined) => NewProjectIconField | undefined
  /** The open picker, or null. */
  sheet: ReactNode
}> {
  const organization = useOrganizationRecord(orgId)
  const [icon, setIcon] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const fallback = <ProjectDefaultGlyph size={20} color={colors.link} />

  const sheet = open ? (
    <IconPickerSheet
      value={icon}
      isEmojiIconAllowed={emojiIconsOffered(organization)}
      fallback={fallback}
      onClose={() => setOpen(false)}
      onSave={(next) => {
        setIcon(next)
        return Promise.resolve(null)
      }}
    />
  ) : null

  const field: NewProjectIconField = {
    value: icon,
    isEmojiIconAllowed: isEmojiIconAllowedOf(organization),
    fallback,
    onChoose: () => setOpen(true),
  }
  const shown = supportsOrganizationIcons(organization)

  return {
    icon,
    fieldFor: (type) => (shown && type !== 'managed' ? field : undefined),
    sheet,
  }
}
