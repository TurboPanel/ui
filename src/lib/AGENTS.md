# Library Rules — AGENTS.md

## Ask again before permanent actions (step-up)

An organization owner can turn on "ask people to confirm it is them before permanent actions" (Manage Organization → Security, `ReauthSettingsSection`). `fetchWithStepUp` (`src/lib/step-up.ts`) wraps every request in `instance-api.ts`: a `403 reauth_required` opens the single app-wide `ReauthSheet` (mounted in `AppProviders`; password, or the authenticator code for people who use one), then the original request is sent once more. Do not add a new `fetch(controlPlaneUrl(...))` to `instance-api.ts` without going through `fetchWithStepUp`, or that action will show a bare 403 instead of the prompt. Logic, copy and the broker are in `src/lib/step-up.ts` (covered); the sheet is chrome.


## Command Pipeline UI

Per-server command actions use `src/components/org/server-commands-panel.tsx` on the server detail **Control** tab. Commands follow a create-then-poll pattern: the UI enqueues via a mutation hook, receives a `commandId`, then polls with `useCommandsBatch` from `src/lib/queries/commands.ts` (`COMMAND_POLL_MS`, `isTerminalCommandStatus`) — a single React Query with `refetchInterval` while any tracked command is non-terminal. Each tick is **one** `POST /commands/status` request for every tracked id (via `fetchCommandStatuses`), not one `GET` per command; results are re-aligned to entry order so index-based consumers stay correct, and unreadable ids simply drop out. `useCommandRecordsBatch` is the per-id variant (one `fetchCommand` per entry, full `CommandRecord`) kept for the server-detail Control tab, which renders the ping latency breakdown. No hand-rolled `setInterval` per page or per server.

**Failure text.** A failed command's error is a block of daemon output with the cause printed last. The control plane derives `errorLine` (on `CommandRecord`, `CommandStatusRecord` and `DeploymentHistoryRecord`; absent on an older control plane) and screens show that one line through `commandErrorLine` in `src/lib/command-error.ts` (it falls back to the last non-empty line of the text). The deploy history detail keeps the whole text one tap away (`commandErrorDetail`, "Show full error"). The failure shows in deploy history, the organization Activity list, the server Control tab, the environment deploy status and the project delete flow.

**Deploy progress.** The batched `POST /commands/status` record (and `GET …/commands/:id`) carries `progress: CommandProgress | null`, the daemon's step plan and current step (optional; absent on an older control plane). `DeployProgressRail` (`src/components/org/project/deploy-progress-rail.tsx`) and the environment status chip read it from the poll's records via `commandStatusById`, **not** from the Overview's `TrackedCommand` meta: that meta only changes on a status or error change, so step updates would be dropped. The poll also drops a command the tick it turns terminal, so `useDeployLogProgress` holds the last plan per command id and, once terminal, reads the full record once (`useCommandRecordsBatch`; `GET …/commands/:id` carries the finalised plan) so the end state stays above the outcome banner until the log is closed. Derivations (step count, gerund labels, first-time caption, `mm:ss`) live in `src/lib/deploy-progress.ts` and count like the control plane does (total = steps not `ready`; position = `done` + 1 while running). The Environments tab has no command poll of its own, so it asks for status only for the commands of deploys still in flight (`inFlightDeployEntries`). Activity rows show `step` / `totalSteps` / `stepLabel` from `activity-query`.

**Who pushed.** `DeploymentTriggerRecord.pushedBy` (activity and deployment history `trigger`) is the pusher's git login, optional because an older control plane omits it and `null` when the push named nobody. `gitPushLabel` (`src/lib/activity.ts`) is the one place that words a push: `octocat (Push to main)` with a login, else `Push to main` / `Git push`; the Activity list and the Overview deploy list both use it. The Activity Started By cell puts `GitNavIcon` beside the label only when `activityPushedBy` returns a login.

### API helpers — `src/lib/instance-api.ts`

- `pingDaemon(serverId)` → `POST /api/client/v1/servers/:id/commands/ping` — returns `CommandEnqueueResponse`: `{ ok: true, commandId, status }`.
- `setServerHostname(serverId, hostname)` → `POST /api/client/v1/servers/:id/hostname` — returns the same `CommandEnqueueResponse` shape: `{ ok: true, commandId, status }`.
- `rebootServer(serverId)` → `POST /api/client/v1/servers/:id/commands/reboot` — returns `CommandEnqueueResponse`.
- `revokeServerDaemonKey(serverId)` → `POST /api/client/v1/servers/:id/daemon-key/revoke` — the compromised-host cutoff, surfaced as a two-step `ConfirmButton` panel above **Delete server** on the server detail page (hidden without manage; a muted note on the co-located control plane server, which the API refuses with 403). Returns `ServerDaemonKeyRevokeResult`: `{ ok: true, revokedAt, purged, purgeError? }` — `purged: false` means the durable revoke landed but the live daemon cell was unreachable; the host is still cut off at its next reconnect or session refresh. 409 `Server is not enrolled` when there is no key to revoke. Idempotent. Recovery is delete + fresh enroll; the API refuses re-enrollment of a revoked server.
- `fetchCommand(serverId, commandId)` → `GET /api/client/v1/servers/:id/commands/:commandId` — returns `CommandRecord`; for `daemon.ping` commands the response includes optional `latency` (`PingLatencyBreakdown`).
- `fetchCommandStatuses(ids)` → `POST /api/client/v1/commands/status` — one request for many tracked ids (max 100, deduped server-side); returns `CommandStatusRecord[]`. Ids the session cannot read are omitted from the response rather than failing the batch. This is the polling path; `fetchCommand` stays for the single-command detail view that needs `latency` / `result`.
- Types: `CommandStatus` (string union of all statuses), `PingLatencyBreakdown`, `CommandRecord`, `CommandStatusRecord`, `CommandEnqueueResponse`.
- `CommandStatusRecord` is the lean lifecycle projection — `{ id, serverId, status, type, queuedAt, startedAt, finishedAt, errorCode, errorMessage, hasLog }`. No `payload`, `result`, `attempts`, or `latency`; read `errorMessage` (not `error`) for the failure text.
- The `CommandRecord` shape is flat (all lifecycle timestamps are top-level fields). The instance serializes it from **real `command` columns** — `status`, `attempts`, `error_code`, `error_message`, `result_summary`, and every granular lifecycle timestamp (`queued_at`…`finished_at`, `expires_at`) are columns, not a jsonb blob. `metadata` is **no longer** the source of those fields: it survives only as the follow-up-chain blob (`pendingStandbyApplies`, `followUpPromote`, `pendingTlsLeaf`, `desiredHash`) and never reaches the UI. `CommandRecord` still **excludes the dispatch payload** — that lives in the separate `dispatch` table and is never serialized to a client. See `turbopanel/src/features/commands/AGENTS.md` and `turbopanel/src/db/AGENTS.md`.

**Latency breakdown shape** (`CommandRecord.latency` for `daemon.ping`):

```
PingLatencyBreakdown {
  apiToConsumerMs: number | null       // queuedAt → dispatchStartedAt
  consumerToCellMs: number | null      // dispatchStartedAt → sentAt
  cellToDaemonMs: number | null        // sentAt → ackedAt
  daemonProcessingMs: number | null    // daemonReceivedAt → daemonRespondedAt (from result)
  daemonToRecordedMs: number | null    // daemonRespondedAt → finishedAt
  totalRoundTripMs: number | null      // queuedAt → finishedAt
}
```

Segment durations are computed server-side from the flat `CommandRecord` lifecycle fields (`queuedAt`, `dispatchStartedAt`, `sentAt`, `ackedAt`, `finishedAt`) before being exposed on `CommandRecord.latency`.

### Execution logs (command transcripts)

Command stdout/stderr is captured by the daemon, uploaded as redacted NDJSON
`CommandOutputEvent` lines, and read back through
`GET /api/client/v1/servers/:id/commands/:commandId/log?from=&max=`
(`fetchCommandLog` → `CommandLogResponse`). `from` is a **chunk** sequence, not a
byte offset; poll with the previous response's `nextSeq`. `exists: false` is the
"not started" state — the route never 404s a poll loop, so "waiting for output"
and "no transcript retained" stay distinguishable.

- Hook: `useCommandLog(orgId, serverId, commandId)` in
  `src/lib/queries/execution-logs.ts`. One React Query per open transcript;
  `refetchInterval` is `COMMAND_LOG_POLL_MS` (1 s) only while the latest read is
  not `sealed`, then `false`. Pass `poll: false` for an already-terminal command.
  Chunks accumulate in a ref keyed by `(serverId, commandId)` and are deduped by
  event sequence, because a read whose byte budget split a chunk replays it with
  an unchanged `nextSeq`.
- Parsing lives in `src/lib/execution-log-lines.ts`: NDJSON events become
  `LogTranscriptLine[]`; plain-text lines (the store's truncation marker, legacy
  output) degrade to `stdout` rows instead of being dropped. ANSI is **stripped**,
  never interpreted.
- A deploy's log lives on its own page under Deployments
  (`deployments/[deploymentId].tsx` → `src/components/logs/deployment-log-screen.tsx`),
  rendered by `LogViewer` (`src/components/logs/log-viewer.tsx`): steps from
  each line's `phase`, step states from the plan (`CommandProgress`), closed by
  default with the failed (or first) step open, search across steps, Live.
  Its model is pure in `src/lib/log-viewer.ts`. History rows and the Overview
  progress card's **Open full log** link there.
  A service page (Services › service) has a **Runtime log** section with the
  same viewer, ungrouped, over `useContainerLogTail` (last 200 lines, never
  stored, Live off until switched on, off when the app goes to the background).
- The older flat viewer, `src/components/org/logs/log-transcript-view.tsx`, still
  renders the Overview progress card's output, the managed **Apply
  transcript**, the managed **Engine logs** tail, and the per-container live
  tail on the environment containers panel. Do not fork either per surface; see
  `design-system/turbopanel/pages/deploy-logs.md`. Both are a fixed-height
  nested scroll with a visible scrollbar; **Deployment history** caps its row
  list the same way (`environment-deployment-history-panel.tsx`).

### Container logs (live tail)

Container stdout/stderr is **not retained**. There is no fleet-wide explorer,
no org `containerLogsEnabled` switch, and no stored page. The console tails
**one** running container on demand:

- `GET /api/client/v1/containers/:id/logs` — correlated cell round trip; the
  daemon runs `docker container logs` and returns the bytes. Nothing is stored.
- Hook: `useContainerLogTail` in `src/lib/queries/containers.ts` (`enabled: false`
  by default; optional Follow is a refetch cadence, not a host `--follow`).
- Rendering: `LogTranscriptView` on the environment containers panel
  (`src/components/org/logs/container-log-tail.tsx`). Do not fork a second viewer.

Do not reintroduce a Logs org area, `/<orgId>/logs` routes, a presence-ack
collector flag, or a fleet-wide `GET /organizations/:id/container-logs` scan.

### Deploy history

`GET /api/client/v1/environments/:id/deployments` (`fetchEnvironmentDeployments`)
reads the append-only `command` table — `deployment` is upsert-per-(environment,
server) current state and cannot list past deploys. A row's `id` **is** the
command id, so the same id fetches the transcript. Multi-host deploys arrive as
several rows sharing one `generation`; the UI groups them client-side
(`src/lib/deployment-history.ts`) instead of fanning out to
`/deployments/:deploymentId` per row. `useEnvironmentDeployments` never polls —
it is invalidated by `invalidateEnvironmentSubtree` (deploy/lifecycle mutations)
and when a tracked deploy command reaches a terminal status.

### Ping / hostname / reboot

- Surface on the server detail **Control** tab via `ServerCommandsPanel`.
- Mutations: `usePingDaemon` / `useSetServerHostname` / `useRebootServer` from `src/lib/queries/servers.ts`.
- In-flight command ids feed `useCommandsBatch`; terminal success invalidates the server detail key.
- Hostname/reboot gated by `useCan(…, 'organization:manage')` as a display hint; disabled when `!server.connected`.
- The hostname field is labelled **Change the server's own name (Linux hostname)** with a hint that it is not the DNS name clients use: it renames the Linux hostname only. The DNS name clients dial lives in the Network tab's **Addresses clients use** card.
- Reboot uses two-step confirm. Do not add per-server background polling loops — O(1) shared batch query only.

