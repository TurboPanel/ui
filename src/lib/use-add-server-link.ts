import { useEffect, useRef } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { isAddServerRequest } from '@/lib/org-navigation'

/**
 * Opens the Add server steps whenever the address asks for them (`?add=1`, the
 * search's "Add server"), also when the Servers list is already showing, then
 * clears the query so a refresh or Back does not open them again.
 */
export function useAddServerLink(onOpen: () => void): void {
  const { add } = useLocalSearchParams<{ add?: string | string[] }>()
  const router = useRouter()
  const latest = useRef(onOpen)
  useEffect(() => {
    latest.current = onOpen
  })
  const requested = isAddServerRequest(add)
  useEffect(() => {
    if (!requested) return
    latest.current()
    router.setParams({ add: undefined })
  }, [requested, router])
}
