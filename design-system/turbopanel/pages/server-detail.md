# Page Override: Server Control Panel

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/servers/[serverId]`.

**Route:** `src/app/[orgId]/servers/[serverId]/index.tsx` → `server-detail-section.tsx`  
**Job:** Single-host control — identity, commands, time/NTP, network addresses, embedded metrics.

---

## Layout

- Sticky detail header: back link, OS logo, title, hostname (mono), status dot + Online/Initializing/Offline + flag, optional **Platform Server** pill (TurboPanel T mark + label) when colocated, then a muted `via Local Unix Socket` / `via <IP>` line — no Connection panel on Overview; version lives on Control → Daemon update. Initializing reuses the fleet LED pulse.  
- Segmented tab rail (`orgPanelStyles.segmentGroup` / `segmentChip`) — active tab in `?tab=` query param  
- Hairline borders between sections; panels only where they group an interaction — no nested decorative cards  
- Tab body swaps instantly (no page transition animation)

## Density

- Label/value rows in Overview; monospace for IDs, IPs, timezone, NTP host lists, label keys/values  
- Status: geometric dots with text labels — never color-only  
- Flag emoji beside Online when geo is known (fleet consistency)

## Tabs

| Tab | Content |
|-----|---------|
| Overview | Identity, OS, geo when reported, timezone (incl. datacenter source/enforce), SSH port (effective + override), labels editor |
| Control | Ping, hostname, reboot; read-only **Server proxy** panel (platform hosting-ingress status + one allowlisted Restart); trunk update; delete (two-step) |
| Time | NTP status, timezone picker (org/datacenter enforce), NTP apply form (prefill from inherited `ntpDefaults` when host facts are empty) |
| Network | Datacenter assignment, mesh membership, managed IPs, interface address groups |
| Metrics | Embedded `ServerMetricsSection` (no duplicate page title) |

## SSH port (Overview)

- Effective listen port + source (server / datacenter / organization / platform 22).
- Manage-gated override; empty save inherits the parent layer (`PATCH options.sshPort: null`).
- Desired configuration only — never presented as rewriting sshd.

## Labels (Overview)

- Replace-all key/value editor on Overview — **not** a new tab.
- Docker engine-label charset: keys `[A-Za-z0-9][A-Za-z0-9._-]*`, max 64 labels, key/value length 255.
- Manage-gated (`organization:manage` display hint). Non-managers see a read-only list.
- Visible labels, errors adjacent to the editor, `toolbarBtn*` for Add/Save/Remove. Monospace keys/values.

## Hardware profile panel (Overview tab)

- Collapsible; capability discovery (`GET …/metrics/capabilities`) is a live daemon round trip that fires only once the panel is expanded — opened deliberately, never polled.
- **VM / no-hwmon empty state:** when discovery returns zero sensor and GPU candidates, the sensor-slot + GPU section collapses to a single `EmptyState` ("No hardware sensors detected") instead of a row of empty pickers. NIC bindings, hosting storage path, and manual CPU TDP/Tjmax overrides stay visible below it — those aren't hwmon-dependent.
- **Disk temperature has no auto-default:** unlike every other slot (which falls back to the daemon's first-match candidate and reads "Auto detected"), the Disk 1/2 temperature pickers read "Not selected" and sit under an `InlineNotice` explaining there is no automatic default — the operator must pick one explicitly per disk.
- **Reassignment breaks continuity:** when any populated sensor slot or NIC field actually changes value, the plain Save button is swapped for `ConfirmButton`, warning that reassigning breaks chart continuity for the changed series (mirrors the Metrics screen's generation-break dividers).
- **Drivetemp is opt-in:** the toggle sits under an `InlineNotice` explaining it loads the `drivetemp` kernel module (persists across reboot). A save that newly enables it explicitly refetches capabilities so newly-discovered chips appear without collapsing/reopening the panel.
- **CPU TDP/Tjmax prefill:** when no manual override is set, the placeholder shows the resolved catalog value (`EffectiveCpuThermalLimits`, read from the summary endpoint) and the hint notes whether it's an exact catalog match or a family-regex estimate.
- **Hosting storage path** is a `Select` over `capabilities.storageMounts.candidates`, never free text — the stored override is injected as an extra option when the daemon no longer discovers it, so it never silently disappears from the picker.

## Server proxy (Control tab)

- Read-only panel between Commands and Daemon update: status dot + label, container name (mono), compose service name, link into the System workspace project/environment.
- **Restart** is the only mutation; gated by `useCan('organization', orgId, 'system:operate')` as a display hint. Shares the page’s single `useCommandsBatch` timer (`kind: 'systemRestart'`) — no second poll loop.
- States: not provisioned, pending allocation, running, exited/failed, load error. Never color-only status.

## Motion

- Tab press: 150–200 ms opacity on chips  
- No modals for routine commands — inline progress under actions

## Anti-patterns (page-specific)

- ❌ `fetchServerCell` / Durable Object reads  
- ❌ Per-server polling beyond the single detail refresh + one command timer  
- ❌ Modal-per-action for ping, timezone, or NTP  
- ❌ Emoji icons for actions  
- ❌ Raw hex outside `theme.ts` tokens
- ❌ Implying SSH port save rewrites sshd
