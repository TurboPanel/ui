import { Redirect } from 'expo-router'
import { DeveloperShell } from '@/components/developer/developer-shell'
import { DeveloperProvider } from '@/lib/developer-context'

export default function DeveloperLayout() {
  // The developer console is a dev-only surface. In a production build (`__DEV__`
  // is false) the instance does not serve `/api/developer/*` either, so bounce
  // back to the landing page instead of rendering a console that can't talk to
  // anything. The future instance-admin surface will live under its own route.
  if (!__DEV__) {
    return <Redirect href="/" />
  }

  return (
    <DeveloperProvider>
      <DeveloperShell />
    </DeveloperProvider>
  )
}
