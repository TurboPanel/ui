# Page Override: Updates

> Overrides `design-system/turbopanel/MASTER.md` for `/admin/updates`.

**Route:** `/admin/updates` → `updates-section.tsx`.

**Job:** Two independent upgrades on this host: the control plane (instance package plus the static UI export it installs) and the co-located daemon. They do not share a manifest pin.

---

## Layout

- Tokens from `src/lib/theme.ts` only. Installed versions use `Badge` plus the version text.
- One `SectionPanel` titled **This host**. A `DataTable` with columns Unit, Installed, Channel target, and an Upgrade action. Two rows: **Control plane** and **Daemon**.
- A missing channel package (trunk, or any channel with no manifest) shows "No package on this channel" and disables Upgrade for that row.
- The daemon row shows "Not connected" and disables Upgrade when the co-located daemon is disconnected.

## Upgrade

- Control-plane Upgrade posts `POST /api/admin/v1/instance/updates/instance` and does not wait on the install response. A status-only 502/503 is a restart. `waitForUnitUpdate` then polls `GET /api/admin/v1/instance/updates` until the installed version matches the target (`applied`), the panel answers with the old version after the wait (`reconnected`), or it never answers (`unreachable`).
- Daemon Upgrade posts `POST /api/admin/v1/instance/updates/daemon` and polls the same read. The control plane stays up.
- A JSON-bodied 503 (`no co-located daemon connected`, `co-located daemon disconnected`) is a real refusal and stays on the notice.
- Workers answers 422 for the control-plane row (`control-plane update is not applicable on this runtime`). A channel other than canary, rc, or release answers 422 naming the channel.
