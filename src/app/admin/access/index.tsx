import { HostnamesSection } from '@/components/admin/access/hostnames-section'
import { SuperadminOnly } from '@/components/admin/access/superadmin-only'

export default function AdminAccessScreen() {
  return (
    <SuperadminOnly title="Hostnames">
      <HostnamesSection />
    </SuperadminOnly>
  )
}
