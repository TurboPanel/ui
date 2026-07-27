import { isForbiddenError } from '@/lib/instance-api'

export type GuardedActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string | null }

/**
 * Runs `action`, folding the repeated "forbidden → sign out, otherwise
 * surface an error message" handling used throughout the org console into
 * one place so callers stay a flat if/else instead of nested try/catch
 * blocks (which otherwise blow out cognitive-complexity budgets fast).
 */
export async function withGuardedAction<T>(
  action: () => Promise<T>,
  handleUnauthorized: () => Promise<void>,
  fallback: string,
): Promise<GuardedActionResult<T>> {
  try {
    return { ok: true, value: await action() }
  } catch (err) {
    if (isForbiddenError(err)) {
      await handleUnauthorized()
      return { ok: false, error: null }
    }
    return { ok: false, error: err instanceof Error ? err.message : fallback }
  }
}
