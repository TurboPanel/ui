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
| Overview | Identity, OS, geo when reported, timezone (incl. datacenter source/enforce), license tier placement, SSH port (effective + override), machine class pin, hardware profile, labels editor |
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

## License tier (Overview tab)

- `ServerTierPlacementPanel` reads `tierPlacement` off the detail record — no extra fetch, no polling; the panel is omitted when the record carries none.
- Header `Badge` = bound license tier (`Unlicensed` when null); tone from `tierPlacementState` in `src/lib/tier-placement.ts` — `danger` below the required floor, `pending` below the recommendation, `info` two or more ranks above it, `ok` otherwise, `muted` when unranked. Ranks come from the billing catalogue when `billingEnabled`, else the `S<n>` label shape (`SX` on top). Never color-only: the label text is always present.
- Three label/value rows: license tier, required (cores + RAM floor), recommended (discovered NIC / drive / GPU counts). When `tierPlacement.notice` is set (the control plane's daily entitlement-notice marker — hosted only), a fourth **Daily notice** row states what org owners are being emailed about (`exceeds` / `overprovisioned`) and when the last one went out (`formatRelativeLocalDateTime(lastNotifiedAt)`), and a **Daily notice** `Badge` (`pending` for `exceeds`, `info` for `overprovisioned`) sits beside the tier badge in the header. Presence on the wire *is* the state — the panel never infers it from ranks.
- **Shortfall:** `InlineNotice` (warning) naming the situation, with a primary **Upgrade to Sn** action that deep-links to `/[orgId]/billing?tier=<recommended>&license=<licenseId>` (hosted only — the button is absent when billing is off). Under it, the specific unmonitored devices from `unwatched` (device ids on detail) in `MonoText`, grouped Drives / NICs / GPUs.
- **Over-provisioned** (license ≥ recommended + 2): muted `InlineNotice` (info) — informational, no action.
- The servers table shows the same chip (`Tier` column, unwatched **counts** in a one-line note, plus the **Daily notice** chip and a `notified <age> ago` suffix when the marker is set) — same state rules, label-shape ranks only so the O(1) list adds no billing read.

## Machine class (Overview tab)

- `ServerMachineClassPanel` — collapsible, default collapsed, hint shows the current class (`Auto · inferred…` / `Physical · hardware-sensor slots entitled` / `Virtual · no hardware-sensor slots`).
- `SegmentedControl` **Auto / Physical / Virtual** bound to `server.machineClass` (`null` = Auto). Manage-gated the same way as labels (`organization:manage` display hint; non-managers see the control disabled with "Manage permission required.").
- Sits under an `InlineNotice` (mirrors the drivetemp opt-in notice) explaining that the pin sets **entitlement, not collection**: Physical unlocks the tier's hardware-sensor slots, Virtual suppresses them, a VM emits no sensor row at any tier, Auto infers Physical once sensors are discovered and never infers Virtual.
- Saves through `useSetServerMachineClass` (`PATCH /servers/:id { machineClass }`), which invalidates the server's metrics subtree — the capability plan resolves from the class, so the next series payload can gain or lose whole families.

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
