/**
 * Web no-op — tab paging is native-only. Metro resolves
 * `org-tab-pager.native.tsx` on iOS/Android.
 */
export function OrgTabPager(_props: Readonly<{ orgId: string }>) {
  return null
}
