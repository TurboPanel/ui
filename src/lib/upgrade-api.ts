import { isHttpStatusError } from '@/lib/fetch-error-detail'

export function isManagedUpgradeApiMissing(err: unknown): boolean {
  return isHttpStatusError(err, 404)
}
