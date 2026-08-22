# Page Override: Container logs

> Overrides `design-system/turbopanel/MASTER.md` for the organization
> container-output explorer. Read alongside
> `design-system/turbopanel/pages/deploy-logs.md` — that file owns the viewer
> itself; this one owns the surface around it.

**Surfaces:**
- Organization → **Logs** — filter bar + results
  (`container-log-explorer-section.tsx`, `container-log-filter-bar.tsx`)
- Organization → Logs → **Settings** — the retention switch
  (`container-logs-settings-section.tsx`)

**Job:** answer "what did anything in this organization print, and when" —
across servers, environments and services — without inventing a query language
the store cannot execute, and without letting an off switch look like silence.

---

## Shared viewer

The results list is `src/components/org/logs/log-transcript-view.tsx`, **unchanged**.
Container output and command transcripts render identically on purpose: one log
language in the console, one virtualized list, one follow-tail behaviour. Do not
fork it, do not wrap it in a second block style, and do not add a
container-specific row renderer.

Container events are adapted to `LogTranscriptLine` by
`containerLogEventsToTranscriptLines` (`src/lib/container-log-query.ts`):

- `phase: null` always — phases belong to command transcripts. No phase headers
  appear here, and none should be invented from service names.
- `seq` is **synthetic and ascending** over the flattened pages. Container lines
  carry no per-command sequence; the value exists only to key rows.
- Pages arrive newest-first; the mapper reverses them so the newest line is at
  the bottom, where follow-tail lives.
- ANSI is stripped by the same `stripAnsi` the transcript viewer uses.

## Filters are the query language

The read route's predicate set is **closed**: `from`, `to`, `serverId`,
`environmentId`, `serviceId`, `containerId`, `stream`, `search`, `cursor`,
`limit`. That set is simultaneously the store's `ORDER BY` prefix and its
partition plan, so widening it is a storage migration, not a UI change.

- Every control in the bar maps **1:1** onto one of those keys.
- Unset filters are **omitted**, never sent empty.
- `stream: all` means "send no `stream` key" — it is not a third value.
- There is **no free-text query builder**, no boolean expression field, no
  "advanced mode". A control that cannot be answered by one predicate does not
  belong on this page.
- The resolved window is shown read-only as **`Showing <from> – <to>`**. The
  operator must always be able to see what range produced what is on screen.
- Default range is **15m**. Opening the page must not fan out a day-wide scan.

## Tokens

`theme.ts` + `org-panel-styles.ts` only.

| Role | Token | Notes |
|------|-------|-------|
| Filter chips | `orgPanelStyles.segmentChip` (+`Active`) | Same chips as every other filter row; never a bespoke pill |
| Range / stream switch | `SegmentedControl` | Closed small sets — never a dropdown |
| Window label | `colors.textBody`, tabular numerals | Read-only; not an input |
| Panels | `SectionPanel` | Filters and Results are two panels, no glass card of their own |
| Results block | `orgPanelStyles.commandCodeBlock` (via the viewer) | Inherited — do not restyle |
| Scan-ceiling notice | `orgPanelStyles.calloutWarning` | Existing warning callout |

## State matrix

| State | Meaning | Render |
|-------|---------|--------|
| loading | First page in flight | `LoadingState` "Reading container output…" |
| `ok` + lines | Store answered with output | Filter bar + `LogTranscriptView` |
| `ok` + no lines | Retention on, store answered, nothing matched | `EmptyState` panel — "No output in this window", widen/clear hint |
| `disabled` (503 `container_logs_disabled`) | Organization never turned retention on | `EmptyState` panel + link to Logs → Settings |
| `unavailable` (503 `container_logs_unavailable`) | Retention on, store did not answer | `EmptyState` panel — availability copy, no retry button |
| error | Anything else (network, 5xx, 403) | `orgPanelStyles.error` line |
| at ceiling | A full page came back with more behind it | `calloutWarning` above the lines + "Load older" below |

`disabled`, `unavailable` and "nothing matched" are **three different answers**
and must never collapse into one "no logs" state — the control plane goes out of
its way to distinguish them, and the whole point is that "you never turned this
on" cannot look like "your containers printed nothing".

## Pagination

- Cursor-based via `useInfiniteQuery` (`useContainerLogsQuery`). The cache key is
  the composed filter **minus its cursor**, so pages of one window share an entry
  and changing any predicate starts a fresh one.
- Older pages load through an explicit **Load older** button below the viewer.
  The viewer already virtualizes and owns its own scroll — never add a second
  scroll surface or an infinite-scroll sentinel inside it.
- A 503 is folded into local availability state inside the query function. It is
  never rethrown: React Query would retry a switched-off feature forever, and the
  app-wide handler must not see it.

## Polling / live tail

- **No auto-poll by default.** A fleet-wide columnar scan is not a free
  background read.
- **Live tail** is an explicit toggle. It re-resolves the time window every
  `CONTAINER_LOG_LIVE_POLL_MS` (5 s) — a fixed `to` bound cannot grow, so
  re-reading the same query would never surface a new line. While live the query
  holds only the newest page (`maxPages: 1`).
- Filters are **locked** while tailing, and **Load older** is hidden: both would
  fight a window that moves under them.
- Live tail switches **off** when the app loses focus (`AppState`), and does
  **not** resume on its own. Say so in the copy — a timer that silently restarts
  is a scan the operator did not ask for.
- Never a hand-rolled `setTimeout` chain; the tick is one `setInterval` owned by
  the section and cleared on unmount and on toggle-off.

## Retention setting

- One boolean, manage-gated (`useCan('organization', orgId, 'organization:manage')`).
  Non-managers get an `EmptyState` panel telling them to ask an organization
  manager — never a disabled toggle with no explanation.
- The copy states the trade-off **explicitly**: searchable history in exchange
  for storing and paying for every line containers write.
- **Never quote a price.** The console does not know this deployment's storage
  costs; naming the trade-off honestly beats inventing a figure.
- Retention length is platform-wide and rendered **read-only**. It is not a
  cascade and there is no per-service override — do not add one to the UI.
- Saving invalidates the whole `container-logs` subtree so the explorer cannot
  serve a cached page from a window the organization no longer retains.

## Anti-patterns (page-specific)

- ❌ Forking `log-transcript-view.tsx` for container output
- ❌ A free-text / boolean query builder, or any filter outside the closed set
- ❌ Sending an empty predicate (`serverId=`) instead of omitting it
- ❌ A wide default range, or no visible indication of the resolved window
- ❌ Collapsing `disabled` / `unavailable` / "nothing matched" into one empty state
- ❌ Retrying a 503 `container_logs_disabled`, or letting it reach the global handler
- ❌ Background polling without an explicit live-tail toggle
- ❌ Live tail that keeps running when the app is backgrounded, or resumes itself
- ❌ Infinite scroll inside the virtualized viewer (a second scroll surface)
- ❌ Quoting storage prices, or implying retention length is per-organization
