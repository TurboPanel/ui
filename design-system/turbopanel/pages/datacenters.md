# Page Override: Datacenters

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/servers/datacenters` and `/[orgId]/servers/datacenters/[datacenterId]`.

**Routes:**
- List → `datacenters-overview-section.tsx`
- Detail → `datacenter-detail-section.tsx`

**Job:** Group servers on a private network; manage member hosts, scoped networks/IPs, mesh gateways, and per-datacenter timezone defaults.

---

## List layout

- One job: **datacenter cards**, not a dashboard of widgets
- Accent `SectionPanel` create form (manage-gated): display name + description
- **Geo suggestions:** `GET /datacenters/name-suggestions` groups unassigned servers by city/region + ASN; chips prefill the name and pass `sourceServerId` / `assignServerIds` on create
- Name suggestions come from unassigned servers' projected geolocation + ASN metadata. Prefill the highest-count suggestion while the name is untouched and expose all returned suggestions as editable chips. Creating with an active suggestion snapshots its geo and assigns its listed hosts; manually editing the name clears the selection and assignment.
- Each row is `orgPanelStyles.detailCard` — name, description, server count (from one `fetchOrgServers()` group-by; O(1))
- Row press → detail; rename/delete inline (manage-gated); delete confirm copy states servers/IPs are unpinned (`SET NULL`), not destroyed
- Page title / copy via `orgPanelStyles.pageTitle` / `pageCopy`

## Detail layout (stacked panels)

Five `SectionPanel`s, one purpose each — no cards-as-decoration beyond interactive rows:

1. **Member servers** — filtered org servers; assign unassigned hosts (`PATCH` `{ datacenterId }`); Unassign (`{ datacenterId: null }`)
2. **Networks** — `fetchNetworks({ datacenterId })` via shared `NetworkListItem` (kind badge + monospace CIDR)
3. **Mesh gateways** — `fetchVpns()` + bounded `useQueries` peers per mesh (never per server); rows for gateways whose server is in this datacenter (mesh name, gateway server, overlay address, **Primary** badge from `resolvePrimaryGatewayByDatacenter`); show advertised site CIDRs from datacenter-kind networks; empty: “No mesh gateway here — this site is not reachable over the VPN.”; `calloutWarning` when gateways exist but no datacenter CIDR (pre-flight for `gateway_datacenter_cidr_required`)
4. **IP pool** — `fetchIps({ datacenterId })` via shared `IpListRow`
5. **Timezone** — `ServerTimezonePicker` + enforce toggle (same pattern as org fleet settings); copy: enforcing datacenter default beats org default for members

All mutations gated by `useCan('organization', orgId, 'organization:manage')` as a display hint.

## Anti-patterns (page-specific)

- ❌ N+1 server/IP fetches per datacenter card
- ❌ Unbounded peer fan-out — peer queries are bounded by mesh count, never fleet size
- ❌ Showing WireGuard `presharedKey` anywhere
- ❌ Duplicate server-assignment UI on the server Network tab (that tab is display-only for datacenter + private address)
