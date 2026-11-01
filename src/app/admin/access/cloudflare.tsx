import { CloudflareConnectionSection } from '@/components/admin/access/cloudflare-connection-section'
import { SuperadminOnly } from '@/components/admin/access/superadmin-only'

export default function AdminAccessCloudflareScreen() {
  return (
    <SuperadminOnly title="Cloudflare Connection">
      <CloudflareConnectionSection />
    </SuperadminOnly>
  )
}
