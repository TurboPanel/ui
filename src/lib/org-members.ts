import type { BadgeTone } from '@/components/ui/badge'
import type { OrganizationMember, OrganizationMemberRole } from '@/lib/instance-api'

export type MemberAction = 'remove' | 'leave' | null

export type MemberActionInput = {
  /** The signed-in person. */
  viewerId: string | null
  /** The viewer can manage the organization (owner or manager). */
  viewerCanManage: boolean
  /** The viewer is an owner. */
  viewerIsOwner: boolean
  member: Pick<OrganizationMember, 'id' | 'role'>
  /** How many owners the organization has right now. */
  ownerCount: number
}

export const ROLE_LABEL: Record<OrganizationMemberRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  member: 'Member',
}

const ROLE_TONE: Record<OrganizationMemberRole, BadgeTone> = {
  owner: 'ok',
  manager: 'info',
  member: 'muted',
}

export function roleTone(role: OrganizationMemberRole): BadgeTone {
  return ROLE_TONE[role]
}

export function countOwners(members: readonly Pick<OrganizationMember, 'role'>[]): number {
  return members.filter((m) => m.role === 'owner').length
}

/**
 * Which action a row offers. Mirrors what the API would accept, so the screen
 * hides what would be refused: the last owner can neither be removed nor leave,
 * and only an owner can remove an owner. The API still has the final say.
 */
export function memberAction(input: MemberActionInput): MemberAction {
  const { viewerId, viewerCanManage, viewerIsOwner, member, ownerCount } = input
  const isLastOwner = member.role === 'owner' && ownerCount <= 1
  if (isLastOwner) return null
  if (viewerId !== null && member.id === viewerId) return 'leave'
  if (!viewerCanManage) return null
  if (member.role === 'owner' && !viewerIsOwner) return null
  return 'remove'
}

export function memberDisplayName(member: Pick<OrganizationMember, 'name' | 'email'>): string {
  const name = member.name?.trim()
  return name || member.email
}

export function removeConfirmCopy(member: Pick<OrganizationMember, 'name' | 'email'>): {
  confirmLabel: string
  prompt: string
} {
  const who = memberDisplayName(member)
  return {
    confirmLabel: `Remove ${who}`,
    prompt: `Remove ${who} from this organization? They lose all access.`,
  }
}

export const LEAVE_CONFIRM_COPY = {
  confirmLabel: 'Leave organization',
  prompt: 'Leave this organization? You lose all access to it.',
} as const

export function formatJoined(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `Joined ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)}`
}
