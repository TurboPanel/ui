# Page Override: Repositories

> Overrides `design-system/turbopanel/MASTER.md` for the organization
> **Projects → Repositories** surface.

**Surfaces:**
- Organization → Projects → **Repositories**
  (`org/repositories-section.tsx`, route `src/app/[orgId]/projects/repositories.tsx`)

**Job:** answer "which Git repositories is this organization connected to, how
does each one authenticate, and what still uses it" — and offer the delete for
rows nothing uses. Nothing more.

---

## A ledger, not a registration step

Repositories are still *attached* from the project flows — the picker in the
create wizard and the Services form — and both lanes are idempotent, so exactly
one row exists per repository per organization (canonical clone URL,
server-enforced). This page is where that accumulation becomes visible: what
connected, through which lane, and what would be orphaned by deleting it.

There is deliberately **no "add repository" form here**. A row created in
advance, detached from any project, is exactly the stale inventory this page
exists to clean up. Anti-pattern: adding one.

## One table, dense, no cards

`DataTable` inside one `SectionPanel`, per MASTER's dense-table rules. Columns:

| Column | Content |
|--------|---------|
| Repository | `repositoryLabel()` (owner/repo) over the canonical URL in `MonoText` |
| Access | `Badge` — connected account login (`ok`), **Deploy key** (`info`), **Anonymous** (`muted`) — the word carries the state, never color alone |
| Branch | tracked branch; when the provider's last-detected default differs, a second `pending`-toned line `provider: <branch>` |
| Auto-deploy | the policy label, muted |
| Used by | project names from `project.repositoryId` (one projects query — never a per-row fan-out); **Not used** muted |
| Actions | **Refresh** (ghost, connection rows only) · **Delete** (`ConfirmButton`, two-press) |

## Delete is offered only when nothing uses the row

A row named by any project shows **In use** where the delete button would be —
disabled-by-absence, with the reason in place, not a button that always 409s.
The client-side usage index is a courtesy; the server's **409**
`source_referenced_by_compose` stays authoritative (compose can reference a
repository the `repositoryId` column misses) and renders as "detach it from the
service first", never as a retryable failure.

## Refresh exists because providers will not tell us

A default branch is recorded at attach time and the upstream value can change
silently. **Refresh** re-reads the provider and records what it saw
(`metadata.detectedDefaultBranch`); the tracked branch follows only while the
operator has not pinned one. Deploy-key and generic-git rows have no provider
to ask, so they show no Refresh button at all — not a disabled one.

The result is stated in an `InlineNotice` (info tone) naming the repository and
the branch found; failures use the warning tone. Never a modal.

## Anti-patterns (page-specific)

- ❌ An add/register-repository form on this page
- ❌ A delete button that is always rendered and left to 409
- ❌ Per-row `useRepositoryDetail` / webhook fan-out just to render the list
- ❌ Refresh on rows with no connection (hide it, don't disable it)
- ❌ Surfacing drift by color alone — the `provider: <branch>` line is the cue
