import { useLocalSearchParams } from 'expo-router'
import { ProjectCreateSection } from '@/components/org/project-create-section'

export default function NewProjectScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()

  return <ProjectCreateSection orgId={orgId ?? ''} />
}
