import { Redirect, type Href } from 'expo-router'
import { dashboardHref, useAuth } from '@/lib/auth-context'

export default function LandingPage() {
  const { session, needsInstall } = useAuth()
  return <Redirect href={dashboardHref(session, needsInstall) as Href} />
}
