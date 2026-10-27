import { useRouter, type Href } from 'expo-router'

/**
 * A "Back to …" handler that returns to the exact view the person came from
 * (its page, filters and sort live in that URL), or opens `fallback` when the
 * screen was reached directly and there is nothing to go back to.
 */
export function useBackOr(fallback: string): () => void {
  const router = useRouter()
  return () => {
    if (router.canGoBack()) router.back()
    else router.push(fallback as Href)
  }
}
