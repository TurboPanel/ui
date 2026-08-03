/**
 * Re-exports from the central query-key factory.
 * Prefer importing from `@/lib/query-keys` or `@/lib/query-client` for new code.
 */
export {
  ACCESS_MANAGEMENT_PERMISSION,
  authQueryKeys,
  getAccessManagementPermissionKey,
  isVisibilityQuery,
  queryKeys,
  visibilityQueryKeys,
} from '@/lib/query-keys'
