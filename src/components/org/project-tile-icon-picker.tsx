import { useState, type ReactNode } from 'react'
import { IconPickerSheet } from '@/components/org/icon-picker-sheet'
import { ProjectDefaultGlyph } from '@/components/org/project-tile'
import { emojiIconsOffered, isEmojiIconAllowedOf } from '@/lib/icons'
import { useCan } from '@/lib/query-client'
import { useUpdateProjectIcon } from '@/lib/queries'
import { useOrganizationRecord } from '@/lib/queries/auth'
import { colors } from '@/lib/theme'
import { failedRunMessage } from '@/lib/user-error'
import type { HomeProject } from '@/lib/v4/projects-home'

/** A tile kind whose icon can be changed: managed databases and platform projects keep theirs. */
function iconChangeable(kind: HomeProject['kind']): boolean {
  return kind !== 'managed' && kind !== 'platform'
}

/**
 * The Projects list's icon picker: which tiles get a clickable icon (people
 * who can edit projects, once the organization is known, never a managed
 * database or a platform project), and the one sheet that saves the choice
 * through `PATCH /projects/:id`.
 */
export function useTileIconPicker(orgId: string): Readonly<{
  /** Whether a stored emoji draws (missing setting on an older control plane means yes). */
  isEmojiIconAllowed: boolean
  /** The tile's icon action, or undefined when its icon stays plain. */
  changeIconFor: (card: HomeProject) => (() => void) | undefined
  /** The open picker, or null. */
  sheet: ReactNode
}> {
  const canManage = useCan('organization', orgId, 'organization:manage')
  const organization = useOrganizationRecord(orgId)
  const update = useUpdateProjectIcon(orgId)
  const [target, setTarget] = useState<HomeProject | null>(null)
  // Not before the organization is known: its emoji setting decides what the picker offers.
  const canChange = canManage && organization !== undefined

  const changeIconFor = (card: HomeProject) =>
    canChange && iconChangeable(card.kind) ? () => setTarget(card) : undefined

  const saveIcon = async (icon: string | null): Promise<string | null> => {
    if (!target) return null
    const result = await update.run({ projectId: target.id, icon })
    return result.ok ? null : failedRunMessage(result, 'Could not save the icon.')
  }

  const sheet = target ? (
    <IconPickerSheet
      value={target.icon}
      isEmojiIconAllowed={emojiIconsOffered(organization)}
      fallback={<ProjectDefaultGlyph size={20} color={colors.link} />}
      onClose={() => setTarget(null)}
      onSave={saveIcon}
    />
  ) : null

  return { isEmojiIconAllowed: isEmojiIconAllowedOf(organization), changeIconFor, sheet }
}
