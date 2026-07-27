# Page Override: VPNs

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/servers/vpns` and `/[orgId]/servers/vpns/[vpnId]`.

**Routes:**
- List → `vpns-overview-section.tsx`
- Detail → `vpn-detail-section.tsx`

**Job:** Manage org WireGuard meshes (VPN + peers) and enqueue `server.wireguard.apply` on peer hosts.

---

## List layout

- One job: **VPN mesh cards**, not a dashboard
- Accent `SectionPanel` create form (manage-gated): display name + required **mesh CIDR** (e.g. `10.200.0.0/24`) — no network picker
- Each row is `orgPanelStyles.detailCard` — name, monospace CIDR, peers · gateways counts; row press → detail
- Peer/gateway counts via one bounded `useQueries` fan-out of `fetchPeers(vpn.id)` per mesh — never per server; render `—` while loading
- Rename/delete inline (manage-gated); delete confirms peers go with the VPN (host configs are not auto-torn-down)

## Detail layout (stacked panels)

1. **Mesh (CIDR)** — monospace `vpn.cidr`; manage-gated edit via `updateVpn({ cidr })`; every peer interface takes this prefix
2. **Peers (role · overlay address · site · primary)** — Role chip (Gateway / Member), read-only overlay from `tunnelIpId`, site from `server.datacenterDisplayName`, Primary badge from `resolvePrimaryGatewayByDatacenter`; listen port / endpoint shown read-only (auto-configured); public key shows **Pending** until Apply reconciles the daemon key; manage can override overlay (`createIp` scope=`vpn` → `updatePeer({ tunnelIpId })`) + remove
3. **Add peer** — server picker, Role chip (default Member), optional tunnel address (“Leave blank to auto-assign from the mesh CIDR”). No public key / listen port / endpoint / PSK inputs — instance defaults port `51820`, picks the server’s public IP as endpoint, and the daemon generates keys on Apply
4. **Apply WireGuard** — `POST …/apply`; show interface name + per-peer queued/failed results (command ids); surface friendly prepare errors (`gateway_datacenter_required`, `gateway_datacenter_cidr_required`, …) above the rows. Bootstrap pass may omit peers without keys; once all keys reconcile, the consumer enqueues a follow-up full mesh apply. Never show or re-display `presharedKey`.

All mutations gated by `useCan('organization', orgId, 'organization:manage')` as a display hint.

## Anti-patterns (page-specific)

- ❌ Peer counts via one bounded `useQueries` per mesh — never per server (fleet-sized N+1)
- ❌ Showing WireGuard `presharedKey` anywhere after write
- ❌ Asking operators for public keys, listen ports, endpoints, or PSKs on Add peer
- ❌ Polling Durable Objects for apply status — use Postgres command records if/when polling is added
