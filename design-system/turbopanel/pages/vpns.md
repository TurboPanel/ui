# Page Override: VPNs

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/servers/vpns` and `/[orgId]/servers/vpns/[vpnId]`.

**Routes:**
- List → `vpns-overview-section.tsx`
- Detail → `vpn-detail-section.tsx`

**Job:** Manage org WireGuard meshes (VPN + peers) and enqueue `server.wireguard.apply` on peer hosts.

---

## List layout

- One job: **VPN mesh cards**, not a dashboard
- Accent `SectionPanel` create form (manage-gated): display name + **mesh CIDR** (auto-creates kind=`vpn` network) **or** optional link to an existing VPN network — not both
- Each row is `orgPanelStyles.detailCard` — name + linked network; row press → detail
- Rename/delete inline (manage-gated); delete confirms peers go with the VPN (host configs are not auto-torn-down)
- **O(1):** no per-card peer fetches — peer counts live on detail only

## Detail layout (stacked panels)

1. **VPN network** — optional link to kind=`vpn` network (CIDR for tunnel prefixes)
2. **Peers** — server, truncated public key, tunnel / port / endpoint / public IP; manage can edit tunnel + remove
3. **Add peer** — server picker (servers not already peered), WireGuard public key, tunnel address, optional listen port / endpoint / public IP / write-only PSK
4. **Apply WireGuard** — `POST …/apply`; show interface name + per-peer queued/failed results (command ids). Never show or re-display `presharedKey`.

All mutations gated by `useCan('organization', orgId, 'organization:manage')` as a display hint.

## Anti-patterns (page-specific)

- ❌ N+1 `fetchPeers` on the list page
- ❌ Showing WireGuard `presharedKey` anywhere after write
- ❌ Polling Durable Objects for apply status — use Postgres command records if/when polling is added
