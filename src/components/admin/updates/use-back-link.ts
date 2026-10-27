import { useRouter, type Href } from 'expo-router'

export type BackLink = Readonly<{ label: string; onPress: () => void }>

/**
 * A back link whose words say where it really goes. With history it is a plain
 * "Back" to the exact view the person came from (page, filters and sort live
 * in that URL), wherever that was. Reached directly, there is nothing to go
 * back to, so it opens `fallback` and names it ("Back to Update History").
 */
export function useBackLink(fallback: Readonly<{ href: string; label: string }>): BackLink {
  const router = useRouter()
  if (router.canGoBack()) return { label: 'Back', onPress: () => router.back() }
  return { label: fallback.label, onPress: () => router.push(fallback.href as Href) }
}
