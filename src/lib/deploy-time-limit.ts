export const DEPLOY_TIME_LIMIT_MIN = 5
export const DEPLOY_TIME_LIMIT_MAX = 240
export const DEPLOY_TIME_LIMIT_DEFAULT = 30

export type DeployTimeLimitCheck = { minutes: number } | { error: string }

/** Blank means the default; anything else must be a whole number of minutes in range. */
export function checkDeployTimeLimit(text: string): DeployTimeLimitCheck {
  const trimmed = text.trim()
  if (trimmed === '') return { minutes: DEPLOY_TIME_LIMIT_DEFAULT }
  const minutes = /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN
  if (
    !Number.isSafeInteger(minutes) ||
    minutes < DEPLOY_TIME_LIMIT_MIN ||
    minutes > DEPLOY_TIME_LIMIT_MAX
  ) {
    return {
      error: `Enter a whole number of minutes from ${DEPLOY_TIME_LIMIT_MIN} to ${DEPLOY_TIME_LIMIT_MAX}.`,
    }
  }
  return { minutes }
}
