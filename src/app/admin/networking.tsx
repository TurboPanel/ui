import { Redirect } from 'expo-router'

/** Bookmarks and older links. Not an admin area, so the sidebar stays quiet. */
export default function AdminNetworkingRedirect() {
  return <Redirect href="/admin/access" />
}
