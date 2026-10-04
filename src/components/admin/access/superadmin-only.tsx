import type { ReactNode } from 'react'
import { InlineNotice, SectionPanel } from '@/components/ui'
import { isSuperadminSession, useAuth } from '@/lib/auth-context'

/**
 * Hostnames, certificates and Let's Encrypt settings can only be changed by
 * the superadmin. Other admins get a short note instead of controls the
 * server would refuse.
 */
export function SuperadminOnly({
  title,
  children,
}: Readonly<{ title: string; children: ReactNode }>) {
  const { session } = useAuth()
  if (isSuperadminSession(session)) return <>{children}</>
  return (
    <SectionPanel title={title}>
      <InlineNotice title="Superadmin only" body="Only the superadmin can change these settings." />
    </SectionPanel>
  )
}
