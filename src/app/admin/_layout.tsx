import { Redirect, type Href } from 'expo-router'
import { View } from 'react-native'
import { AdminShell } from '@/components/admin/admin-shell'
import { dashboardHref, isAdminSession, useAuth } from '@/lib/auth-context'
import { colors } from '@/lib/theme'

export default function AdminLayout() {
  const { session, needsInstall, isLoading } = useAuth()

  if (isLoading) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />
  }

  if (needsInstall) {
    return <Redirect href={'/install' as Href} />
  }

  if (!isAdminSession(session)) {
    return <Redirect href={dashboardHref(session, needsInstall) as Href} />
  }

  return <AdminShell />
}
