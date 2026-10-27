/**
 * Form choices kept for the rest of the browser session (in memory only, gone
 * on reload), so a form that is filled in again and again starts from the
 * last choices instead of the defaults. Never holds secrets.
 */

const choices = new Map<string, unknown>()

/** The choices last kept under `key`, or `undefined`. */
export function recallSessionChoices<T>(key: string): T | undefined {
  return choices.get(key) as T | undefined
}

export function rememberSessionChoices<T>(key: string, value: T): void {
  choices.set(key, value)
}

/** Drop everything kept (tests, sign-out). */
export function forgetSessionChoices(): void {
  choices.clear()
}
