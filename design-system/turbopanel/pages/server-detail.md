# Page Override: Server Control Panel

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/servers/[serverId]`.

**Route:** `src/app/[orgId]/servers/[serverId]/index.tsx` → `server-detail-section.tsx`  
**Job:** Single-host control — identity, commands, time/NTP, network addresses, embedded metrics.

---

## Layout

- Sticky detail header: back link, OS logo, title, hostname (mono), status dot + Online/Offline + flag, version chip, co-located chip when applicable  
- Segmented tab rail (`orgPanelStyles.segmentGroup` / `segmentChip`) — active tab in `?tab=` query param  
- Hairline borders between sections; panels only where they group an interaction — no nested decorative cards  
- Tab body swaps instantly (no page transition animation)

## Density

- Label/value rows in Overview; monospace for IDs, IPs, timezone, NTP host lists  
- Status: geometric dots with text labels — never color-only  
- Flag emoji beside Online when geo is known (fleet consistency)

## Tabs

| Tab | Content |
|-----|---------|
| Overview | Identity, OS, connection (egress + 24h metrics reporting), geo, timezone |
| Control | Ping, hostname, reboot, trunk update, delete (two-step) |
| Time | NTP status, timezone picker, NTP apply form |
| Network | Datacenter assignment, mesh membership, managed IPs, interface address groups |
| Metrics | Embedded `ServerMetricsSection` (no duplicate page title) |

## Motion

- Tab press: 150–200 ms opacity on chips  
- No modals for routine commands — inline progress under actions

## Anti-patterns (page-specific)

- ❌ `fetchServerCell` / Durable Object reads  
- ❌ Per-server polling beyond the single detail refresh + one command timer  
- ❌ Modal-per-action for ping, timezone, or NTP  
- ❌ Emoji icons for actions  
- ❌ Raw hex outside `theme.ts` tokens
