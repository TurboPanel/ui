import { Slot } from 'expo-router'
import { EnvironmentShell } from '@/components/org/project/environment-shell'

/**
 * Nested layout for `/environments/:environmentId` and its tabs (Overview,
 * Deployments, Services, Compose, Bindings, Hosting, Settings). Compose projects get the shared
 * environment header and tabs here; other project kinds pass straight through.
 */
export default function ProjectEnvironmentLayout() {
  return (
    <EnvironmentShell>
      <Slot />
    </EnvironmentShell>
  )
}
