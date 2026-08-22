# Page Override: Deploy & command logs

> Overrides `design-system/turbopanel/MASTER.md` for every execution-log
> (command transcript) surface.

**Surfaces:**
- Project → environment **Overview** — auto-opened transcript for the deploy that
  was just enqueued (`overview-environments-panel.tsx`)
- Project → environment **Overview** — **Deployment history** list with an
  expandable per-row transcript (`environment-deployment-history-panel.tsx`)
- Managed project **Overview / Settings** — **Apply transcript** beside the
  existing **Engine logs** tail (`managed-status-panel.tsx`)

**Job:** show what a command actually printed, while it runs and after it ends —
without a hand-rolled poll loop and without inventing a second panel language.

---

## Shared viewer

One component renders every transcript: `src/components/org/logs/log-transcript-view.tsx`.
Do not fork it per surface; add a prop instead.

- Chrome is the existing **`orgPanelStyles.commandCodeBlock`** plus the
  `deploy-preview-panel.tsx` layer treatment (monospace filename row +
  `roleBadge`). **No new panel style, no glass, no shadow, no card.**
- Rows are `Text` elements, not a read-only `TextInput` — per-line stream
  colouring is the whole point, and a `TextInput` cannot do it.
- Density 8: font size 12, line-height 17, `spacing.xs` gaps. Timestamps are
  `textFaint` and are suppressed on narrow viewports before the message is.
- The block scrolls **inside itself** (`maxHeight` + a vertical **`FlatList`**);
  wide lines scroll horizontally in their own container. The page body never
  scrolls horizontally, and this viewer is the one sanctioned nested vertical
  scroll (it is bounded by `maxHeight`, unlike a page-level nested scroll).
- Rows are **virtualized**: phase headers and lines are flattened into one
  list data source so a long retained transcript only ever mounts its visible
  window. Never map every line into a `ScrollView`.

## Tokens

`theme.ts` + `org-panel-styles.ts` only — the log tokens that already exist and
were reserved for exactly this:

| Role | Token | Notes |
|------|-------|-------|
| stdout line | `colors.stdout` | Default body colour for transcript text |
| stderr line | `colors.errorText` | Never `colors.error` (too hot at 12px on OLED) |
| phase header | `colors.command` | Phase name; the rule above it is `borderArea` |
| timestamp / seq | `colors.log` → `colors.textFaint` | Muted, never the same weight as the message |
| truncation banner | `orgPanelStyles.calloutWarning` | Existing warning callout, not a new banner |
| controls | `SegmentedControl` + `Button` (`sm`) | Same visual weight as the managed log controls |

Stderr is **never** signalled by colour alone — the row carries a monospace
`stderr` marker chip, matching the console-wide "no colour-only status" rule.

## Phases

Transcript lines carry a `phase` (`prepare`, `pull`, `build`, `pre-deploy`,
`compose-up`, `health`, `post-deploy`, `hooks`, `managed-apply`,
`lifecycle-*`, `stop`). Consecutive lines with the same phase render under one
sticky-looking header row; a phase change draws a hairline rule. Phases are
**grouping only** — never a collapsible accordion that hides output by default.

## Follow tail

- Follow is **on** while the transcript is live (`waiting` / `streaming`) and
  **off** for a sealed transcript opened from history.
- New content auto-scrolls to the bottom only while follow is on
  (`onContentSizeChange`).
- Manual scroll away from the bottom turns follow **off** (`onScroll`, with a
  ~24px bottom threshold). The toggle is a visible control — scrolling up must
  never fight the user.
- Motion: none. No smooth-scroll animation on every chunk, no typewriter effect,
  no auto-pulse. Reduced-motion users get the same behaviour as everyone else.

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
colours on an OLED surface and break the contrast floor. Do not add an
"interpret ANSI" toggle.

## Copy / download

- **Copy all** reuses `CopyButton` and copies the plain rendered text
  (`stream` and phase markers included, ANSI already stripped).
- **Download** is web-only (`Blob` + object URL). On native the control is not
  rendered at all — never a disabled control with no explanation.

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
  invalidated by the deploy mutation and when a tracked command goes terminal,
  mirroring the "containers on Project Overview" rule.
- Only the **expanded** history row fetches a transcript. No per-row prefetch,
  no fan-out over the page.

## Anti-patterns (page-specific)

- ❌ A second log panel style (glass card, terminal-window chrome, fake title bar)
- ❌ `TextInput`-as-log-view (kills per-line colour and selection semantics)
- ❌ Colour-only stderr
- ❌ Hand-rolled `setInterval` / `setTimeout` polling
- ❌ Polling a sealed transcript, or polling every history row
- ❌ Auto-scroll that overrides a user who scrolled up
- ❌ Collapsing `waiting` and `unavailable` into one "no logs" empty state
- ❌ Rendering ANSI colour codes as literal text, or interpreting them as colour
- ❌ Nested vertical scroll without a `maxHeight` bound (breaks native)
- ❌ Mounting every transcript row at once (unvirtualized `ScrollView` list)
