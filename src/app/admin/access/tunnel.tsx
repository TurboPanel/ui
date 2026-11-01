import { CloudflareTunnelSection } from '@/components/admin/access/cloudflare-tunnel-section'
import { SuperadminOnly } from '@/components/admin/access/superadmin-only'

export default function AdminAccessTunnelScreen() {
  return (
    <SuperadminOnly title="Cloudflare Tunnel">
      <CloudflareTunnelSection />
    </SuperadminOnly>
  )
}
