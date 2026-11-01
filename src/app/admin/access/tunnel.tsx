import { Redirect } from 'expo-router'

/** The Tunnel screen became Cloudflare Connection; old bookmarks land there. */
export default function AdminAccessTunnelRedirect() {
  return <Redirect href="/admin/access/cloudflare" />
}
