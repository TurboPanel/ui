import { useLocalSearchParams } from 'expo-router'
import { SearchScreen } from '@/components/org/search-screen'

export default function SearchRoute() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  return <SearchScreen orgId={orgId ?? ''} />
}
