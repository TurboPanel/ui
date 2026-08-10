# Page Override: Network

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/network` and its sub-routes.

**Routes:**
- Sites (area root) → `network-sites-section.tsx` at `/network`
- Site detail → `network-site-detail-section.tsx` at `/network/sites/:datacenterId`
- Links → `network-links-section.tsx` / `network-link-detail-section.tsx`
- Addresses → `network-addresses-section.tsx`
- Docker networks → `network-docker-section.tsx`

**Job:** Operator topology for private connectivity — site → private CIDR → member servers → addresses → site-to-site links. Docker networks are a quiet deploy registry, not topology.

---

## Hierarchy (spine)

1. **Sites** — physical/logical locations that group servers on a private network
2. **Private CIDR** — `kind: 'datacenter'` networks; prerequisite for replicas and mesh gateway site routes
3. **Member servers** — assignment + each host’s private (`scope: 'datacenter'`) address
4. **Addresses** — org free-pool / public / vpn-scoped rows (vpn rows read-only here)
5. **Links** — WireGuard meshes rendered as **site-to-site** connections

Sites is the **area root** (not a sub-route). Links, Addresses, and Docker networks sit in the sidebar as quiet sub-routes.

## Sites list

- One job: **site cards** (`orgPanelStyles.detailCard`), not a dashboard of widgets
- Title **Network** + one line of model copy (sites group servers; links connect sites)
- Card shows name, description, member-server count (from one `useOrgServers` group-by — **never** one query per site), private CIDRs monospace from `datacenter.privateCidrs`
- **Missing CIDR is the headline:** inline `calloutWarning` + **Add private network** (creates `kind: 'datacenter'` scoped to the site). Consequence in one line: site can’t host database replicas without a private network
- Secondary gap, quieter: “N servers here have no private address”
- Links strip per card from `resolveSiteLinks` over one `useVpns` + bounded per-mesh peer fan-out
- Unassigned servers group at the bottom when any server has `datacenterId === null`
- Cold org (zero sites): lead with `FirstRunWizard` instead of an empty table
- Geo/ASN name suggestions on create (`fetchDatacenterNameSuggestions`, `sourceServerId` / `assignServerIds`) when not cold-wizard-only
- Delete confirm: servers and IPs are unpinned, not destroyed; **409** `datacenter_has_networks` copy when networks remain

## Site detail (panel order)

1. **Private network** — CIDR editor first; same actionable empty callout as the card
2. **Member servers** — assign/unassign + private address inline (or muted “No private address”)
3. **Links from this site** — mesh name, other end, gateway server, overlay, **Primary** badge; empty: “No link from this site — it is not reachable from other sites.”; `gateway_datacenter_cidr_required` pre-flight via `calloutWarning`
4. **IP pool** — site-scoped free-pool rows
5. **Timezone** — unchanged picker + enforce toggle

## Links

- List rows lead with **Site A ↔ Site B** (`resolveSiteLinks` / `formatSiteLinkLabel`), then mesh CIDR, then peers · gateways (`—` while peer queries load)
- Detail header states the replication role in one line
- Never show or re-display `presharedKey`; no public-key / listen-port / endpoint / PSK inputs
- **Pending** public key until Apply; friendly prepare errors above rows
- Bounded peer fan-out by mesh count only — no per-server queries, no DO polling

## Addresses

- Scopes: `public | datacenter | vpn` (no `loopback`)
- Scope / allocation filters use `segmentGroup` / `segmentChip`; site filter remains chips
- `scope === 'vpn'` rows read-only with pointer to link detail; **409** `ip_in_use` copy retained
- Optional `?serverId=` filter (legacy networks redirect)

## Docker networks

- Only `kind: 'docker'`; no kind picker
- Fields: display name, Docker network name, optional host pin (`serverId`)
- Copy: compose must use the same name under `networks.*.name`
- Deliberately last in the sub-nav — registry, not topology

## Server detail Network tab

Display-only: site name links to site detail; link peers via `networkLinkHref`. No duplicate assignment UI.

## Anti-patterns

- ❌ N+1 server/IP fetches per site card
- ❌ Unbounded peer fan-out (peers bounded by mesh count, not fleet size)
- ❌ Rendering WireGuard `presharedKey`
- ❌ DO polling for link apply status
- ❌ Duplicate datacenter-assignment controls on the server Network tab
- ❌ Late CIDR validation only — gaps are first-class on site cards

## Tokens

Use `src/lib/theme.ts` + `org-panel-styles.ts` only (`pageTitle`, `pageCopy`, `detailCard`, `detailTitle`, `detailLine`, `statePanel`, `calloutWarning`, `segmentGroup`/`segmentChip`, `toolbarBtn*`, `webPointer`).
