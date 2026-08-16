import { useLocalSearchParams } from 'expo-router'
import { DatacenterFormSection } from '@/components/org/datacenter-form-section'

export default function NewDatacenterScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()

  return <DatacenterFormSection orgId={orgId ?? ''} />
}
