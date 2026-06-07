import { AdminShell } from '@/components/admin/admin-shell'
import { AdminProvider } from '@/lib/admin-context'

export default function AdminLayout() {
  return (
    <AdminProvider>
      <AdminShell />
    </AdminProvider>
  )
}
