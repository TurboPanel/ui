import { CertificatesSection } from '@/components/admin/access/certificates-section'
import { SuperadminOnly } from '@/components/admin/access/superadmin-only'

export default function AdminAccessCertificatesScreen() {
  return (
    <SuperadminOnly title="Certificates">
      <CertificatesSection />
    </SuperadminOnly>
  )
}
