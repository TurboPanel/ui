# Page Override: Container logs

> Overrides `design-system/turbopanel/MASTER.md` for on-demand container
> output. Read alongside `design-system/turbopanel/pages/deploy-logs.md` —
> that file owns the shared viewer.

**Surfaces:**
- Project → environment **Overview** — containers panel row opens a live tail

**Job:** show what one running container is printing right now. Output is
never stored in TurboPanel; the control plane asks the daemon for a
`docker container logs --tail` snapshot.

---

## On-demand tail

- Route: `GET /api/client/v1/containers/:id/logs?tail=`
- Daemon command: `docker container logs --tail`
- Rendered in `LogTranscriptView` (`src/components/org/logs/log-transcript-view.tsx`)
  from the environment containers panel row
- **Never stored** — each open is a fresh host read, not a fleet-wide retained
  archive

Do not fork the viewer. Shared chrome, tokens, virtualization, and copy/download
rules live in `deploy-logs.md`.

## Follow

An optional **Follow** toggle may refetch on a fixed cadence.

- **Off by default** — opening a tail is a one-shot read
- Stops when the app backgrounds — do not keep polling a hidden screen
- Do not resume automatically when the app returns to the foreground

## Anti-patterns (page-specific)

- ❌ A searchable fleet-wide explorer or retention settings page
- ❌ Storing or paging historical container output in the control plane
- ❌ Forking `log-transcript-view.tsx` for container output
- ❌ Follow that stays on when the app is backgrounded, or resumes itself
