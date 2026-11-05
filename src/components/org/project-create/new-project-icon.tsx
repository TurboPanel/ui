import { useState, type ReactNode } from 'react'
import { ProjectsNavIcon } from '@/components/icons/nav-icons'
import { IconPickerSheet } from '@/components/org/icon-picker-sheet'
import { emojiIconsOffered, isEmojiIconAllowedOf } from '@/lib/icons'
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
  field: NewProjectIconField
  /** The open picker, or null. */
  sheet: ReactNode
}> {
  const organization = useOrganizationRecord(orgId)
  const [icon, setIcon] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const fallback = <ProjectsNavIcon size={20} color={colors.link} />

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

  return {
    icon,
    field: {
      value: icon,
      isEmojiIconAllowed: isEmojiIconAllowedOf(organization),
      fallback,
      onChoose: () => setOpen(true),
    },
    sheet,
  }
}
