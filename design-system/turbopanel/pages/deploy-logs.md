# Page Override: Deploy & command logs

> Overrides `design-system/turbopanel/MASTER.md` for every execution-log
> (command transcript) surface.

**Surfaces:**
- Project → environment **Deployments** → a deployment — the deploy's own **log
  page** (`/environments/:environmentId/deployments/:deploymentId`,
  `src/components/logs/deployment-log-screen.tsx`). This is where a build and
  deploy log lives. A Deployments row opens it; there is no expandable
  transcript in the history list any more.
- Project → environment **Overview** — the deploy-progress card for the deploy
  that was just enqueued (`overview-environments-panel.tsx`): step rail, the
  last output and **Open full log**, which goes to the log page above.
- Project → **Services** → a service → **Runtime log** — the same viewer,
  ungrouped, reading the running app's output on demand (rules in
  `container-logs.md`).
- Managed project **Overview / Settings** — **Apply transcript** beside the
  existing **Engine logs** tail (`managed-status-panel.tsx`)

**Job:** show what a command actually printed, while it runs and after it ends —
without a hand-rolled poll loop and without inventing a second panel language.

---

## Shared viewer

Two components, one language:

- **`src/components/logs/log-viewer.tsx` (`LogViewer`)** — the log viewer with
  steps, search, filters and Live. Its model is pure and tested in
  `src/lib/log-viewer.ts`. Used by the deployment log page and a service's
  Runtime log; new log surfaces
  use it, and the older surfaces move to it one at a time.
- `src/components/org/logs/log-transcript-view.tsx` (`LogTranscriptView`) — the
  older flat viewer, still used by the progress card, managed apply, engine logs
  and the container tail until each moves over.

Do not fork either per surface; add a prop instead.

- Chrome is the existing **`orgPanelStyles.commandCodeBlock`** plus the
  `deploy-preview-panel.tsx` layer treatment (monospace filename row +
  `roleBadge`). **No new panel style, no glass, no shadow, no card.**
- Rows are `Text` elements, not a read-only `TextInput` — per-line stream
  colouring is the whole point, and a `TextInput` cannot do it.
- Density 8: font size 12, line-height 17, `spacing.xs` gaps. Timestamps are
  `textFaint` and are suppressed on narrow viewports before the message is.
- The block is a **fixed-height viewport** (`height` = `maxHeight`, default 320)
  around a vertical **`FlatList`**. `maxHeight` alone does not create a scroll
  window on web, so the list would grow the page and hide the scrollbar. Wide
  lines scroll horizontally in their own container. The page body never scrolls
  horizontally, and this viewer is the one sanctioned nested vertical scroll.
- Nested panes (this viewer and **Deployment history**) show a **thin themed
  scrollbar** (`showsVerticalScrollIndicator`, Android `persistentScrollbar`,
  web `overflow-y: auto` + `scrollbar-width: thin` via `nested-scroll.ts`).
  Overlay OS bars otherwise make a capped log look clipped with no way to scroll.
- **Deployment history** caps its row list (`maxHeight` 560) so a long run of
  deploys scrolls inside the panel; the sticky column header stays put. A row
  opens the deploy's log page.
- Rows are **virtualized**: step headers and lines are flattened into one
  list data source so a long retained transcript only ever mounts its visible
  window. Never map every line into a `ScrollView`.

## Tokens

`theme.ts` + `org-panel-styles.ts` only — the log tokens that already exist and
were reserved for exactly this:

| Role | Token | Notes |
|------|-------|-------|
| stdout line | `colors.stdout` | Default body colour for transcript text |
| stderr line | `colors.errorText` | Never `colors.error` (too hot at 12px on a dark log surface) |
| phase header | `colors.command` | Phase name; the rule above it is `borderArea` |
| timestamp / seq | `colors.log` → `colors.textFaint` | Muted, never the same weight as the message |
| truncation banner | `orgPanelStyles.calloutWarning` | Existing warning callout, not a new banner |
| controls | `SegmentedControl` + `Button` (`sm`) | Same visual weight as the managed log controls |

Stderr is **never** signalled by colour alone — the row carries a monospace
`stderr` marker chip, matching the console-wide "no colour-only status" rule.

**The stream is not the verdict.** Docker writes *all* progress to stderr —
stdout is reserved for command results — so `stream === 'stderr'` alone would
paint an entire successful image pull red. A row is an error only when it came
from stderr **and** is not a recognised Compose/BuildKit progress line
(`isErrorLine` in `src/lib/execution-log-lines.ts`); `Error` and `Warning`
statuses stay flagged. Two cosmetic passes ride along, both in that module so
Copy / Download match what is on screen:

- Compose prints its byte counter on events that have no bytes
  (`Pulling fs layer 0B`, `Extracting 1B`). That counter is stripped at parse
  time (`normalizeTranscriptMessage`); a real size (`2.097MB`) is kept.
- Compose emits one line per progress tick and overwrites them in place in its
  own TTY renderer. Consecutive identical **progress** rows collapse to one
  (`collapseRepeatedProgressLines`). Repeated build or app output never
  collapses — that is real output.

## Steps (owner decision 2026-10-24)

Transcript lines carry a `phase` (`prepare`, `install-*`, `pull`, `fetch`,
`build`, `release-promote`, `pre-deploy`, `compose-up`, `health`,
`post-deploy`, `hooks`, `managed-apply`, `lifecycle-*`, `stop`). Consecutive
lines with one phase form one **step** with a header row (`phaseLabel`). A
step's state comes from the deploy's step plan (`CommandProgress`) through a
hand mirror of the server's phase-to-step table (`PHASE_PLAN_STEP` in
`src/lib/log-viewer.ts`); without a plan, the last step takes the command's
outcome. Plan steps that printed nothing (skipped, still to run) are listed
at the end as empty headers.

- Steps are **closed by default**. This replaces the old "grouping only, never a
  collapsible accordion" rule.
- One step **opens by itself**: the failed step; else the running step while
  the deploy runs; else the first step. Once the person opens or closes a step,
  the open set is theirs.
- **Open all steps** / **Close all steps** is one press away.
- **Setup noise stays folded** inside an open step behind "Show N setup lines":
  housekeeping lines of the Prepare step and progress that tools print on
  stderr (`isBenignStderrLine`). Errors and warnings are never folded.
- Desktop shows a step strip above the log (press a step to open it and jump
  to it); a phone lists the steps in the log itself.

## Search and filters

- Search reaches **every** step, closed ones and folded setup lines included.
  While a search (or the errors filter) is on, a step is open exactly when it
  has matches, its header shows the match count, and the field shows "N found".
- Two filter styles, switched next to the field: **Highlight matches (keep
  context)** (the default: each match with 2 lines either side, "…" between
  runs) and **Only matching lines**.
- **Errors and warnings** narrows to error and warning rows. The person turns
  it on; it is never on by default. **Jump to first error** opens that step and
  scrolls to the row.
- Matches are marked with a `warnSoft` background; the field and each step
  header also say the count in words.

## Wrap and timestamps

- Wrap is on and timestamps are off by default on a phone (narrower than
  `layout.desktopBreakpoint`); on a wide screen wrap is off and timestamps are
  on. Both are toggles.
- Wrap off on the web: long lines scroll sideways **inside the log only**; the
  page never scrolls sideways. On a phone app wrap stays on unless switched off.

## Live (follow tail)

- **Live** is a switch shown only while the deploy runs. It is on when the page
  opens on a running deploy: new lines are read every second and the view
  stays at the end.
- Scrolling up away from the end (~24px threshold) **pauses** it, as does the
  switch. Paused, the page stops reading until Live is back on; when the
  deploy ends while paused, the page still reads on until the log is sealed so
  the last lines are never lost.
- When the deploy finishes, Live goes away and the hint says so. A deploy that
  had already finished when the page opened is read once.
- Motion: none. No smooth-scroll animation on every chunk, no typewriter effect,
  no auto-pulse. Reduced-motion users get the same behaviour as everyone else.
- `LogTranscriptView` keeps its older **Follow tail** button with the same
  scroll-up rule.

## State matrix

| State | Meaning | Render |
|-------|---------|--------|
| `idle` | Nothing enqueued / no command id yet | `EmptyState` — "No transcript yet." |
| `waiting` | Command queued, `exists: false` — daemon has not uploaded a first chunk | `LoadingState` "Waiting for output…" |
| `streaming` | Live, chunks arriving, not sealed | Lines + follow toggle + live chip |
| `sealed` | Command terminal, transcript final | Lines, follow off, Copy / Download enabled |
| `truncated` | Retained-size cap hit | `calloutWarning` above the lines, then the retained lines |
| `unavailable` | No execution-log store configured, or transcript expired past retention | `EmptyState` panel — "Transcript unavailable." + retention hint |
| `forbidden` | Session cannot read this command | `EmptyState` panel — permission copy, no retry button |

`waiting` and `unavailable` are distinct on purpose: the control plane returns
`exists: false` for "not started" and never 404s a poll loop, so the viewer must
not collapse them into one "no logs" message.

## ANSI

Escape sequences are **stripped** before render (`stripAnsi`), not translated to
colour. Rationale: the only semantic distinction the console cares about is
stdout vs stderr vs phase, all of which arrive as structured fields; honouring
arbitrary 256-colour SGR from a build tool would put uncontrolled foreground
colours on a log surface and break the contrast floor. Do not add an
"interpret ANSI" toggle.

## Copy / download

- **Copy all** reuses `CopyButton` and copies the plain rendered text
  (`stream` and phase markers included, ANSI already stripped).
- **Download** is web-only (`Blob` + object URL). On native the control is not
  rendered at all — never a disabled control with no explanation.
- `LogViewer` labels them **Copy** and **Download**; both take the whole log,
  whatever is open or filtered.

## Polling

- One `useCommandLog(serverId, commandId)` query per open transcript, cursor-based
  on `nextSeq`, `refetchInterval` **1 s while `sealed === false`, `false` after**.
  Never a `setInterval`.
- A `403` (or any durable client error) on a transcript read becomes the
  viewer's own `forbidden` / `unavailable` state and **stops the interval**. It
  is never rethrown — the app-wide QueryClient routes every query `403` through
  session recovery, and one unreadable transcript must not evict the session.
- A sealed transcript opened from history does not poll at all.
- Deployment history (`useEnvironmentDeployments`) has **no** interval — it is
  invalidated by the deploy mutation, when a tracked command goes terminal, and
  when a deploy the log page is watching ends, mirroring the "containers on
  Project Overview" rule.
- Only the deploy open on the log page fetches a transcript (one host at a
  time). Its status and step plan come from `useCommandsBatch`, which polls only
  while the command is in flight. No per-row prefetch, no fan-out over the page.

## Anti-patterns (page-specific)

- ❌ A second log panel style (glass card, terminal-window chrome, fake title bar)
- ❌ `TextInput`-as-log-view (kills per-line colour and selection semantics)
- ❌ Colour-only stderr
- ❌ Treating every stderr row as an error (Docker progress lives there)
- ❌ Hand-rolled `setInterval` / `setTimeout` polling
- ❌ Polling a sealed transcript, or polling every history row
- ❌ Auto-scroll that overrides a user who scrolled up
- ❌ Opening every step by default, or a search that skips closed steps
- ❌ Turning the errors filter on by default
- ❌ Collapsing `waiting` and `unavailable` into one "no logs" empty state
- ❌ Rendering ANSI colour codes as literal text, or interpreting them as colour
- ❌ Nested vertical scroll without a bounded height (breaks native; on web
  `maxHeight` alone on a `FlatList` does not create a scroll window)
- ❌ Hiding the nested scrollbar (overlay-only) so a capped log looks clipped
- ❌ Mounting every transcript row at once (unvirtualized `ScrollView` list)
