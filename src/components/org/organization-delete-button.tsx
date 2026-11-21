import { useRouter, type Href } from 'expo-router'
import { useState } from 'react'
import { TypeNameDeleteButton, type ButtonSize } from '@/components/ui'
import { postFlashNotice } from '@/lib/flash-notice'
import {
  organizationDeleteFailure,
  ORGANIZATION_DELETE_DIALOG_DESCRIPTION,
  type OrganizationDeleteFailure,
} from '@/lib/organization-delete'
import { useDeleteOrganization } from '@/lib/queries/auth'

/**
 * The one Delete Organization dialog (Organization Settings and Platform Admin
 * > Organizations): type the exact name, then the step-up sheet if the control
 * plane asks (inside the request), then the delete. A refusal stays in the
 * dialog in plain words, with a link to the page that fixes it.
 */
export function OrganizationDeleteButton({
  orgId,
  orgName,
  label,
  size,
  disabled,
  onDeleted,
}: Readonly<{
  orgId: string
  /** The name to type. */
  orgName: string
  /** The button that opens the dialog; defaults to "Delete Organization". */
  label?: string
  size?: ButtonSize
  disabled?: boolean
  /** Called once the organization is gone. */
  onDeleted: (orgId: string) => void
}>) {
  const router = useRouter()
  const mutation = useDeleteOrganization()
  const [failure, setFailure] = useState<OrganizationDeleteFailure | null>(null)

  const confirm = async (typed: string): Promise<boolean> => {
    setFailure(null)
    try {
      await mutation.mutateAsync({ id: orgId, confirmName: typed })
    } catch (err) {
      setFailure(organizationDeleteFailure(err, orgId))
      return false
    }
    // The caller redirects; the notice is queued outside the screen so it outlives that.
    postFlashNotice(`Deleted organization ${orgName}.`)
    onDeleted(orgId)
    return true
  }

  const link = failure?.link ?? null
  return (
    <TypeNameDeleteButton
      label={label}
      size={size}
      disabled={disabled}
      thing="Organization"
      name={orgName}
      description={ORGANIZATION_DELETE_DIALOG_DESCRIPTION}
      error={failure?.message ?? null}
      errorLink={
        link
          ? {
              label: link.label,
              onPress: (close) => {
                close()
                router.push(link.href as Href)
              },
            }
          : undefined
      }
      onOpen={() => setFailure(null)}
      onConfirm={confirm}
    />
  )
}
