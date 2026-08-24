# Page Override: Project Create

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/projects/new` and `/[projectId]/setup`.

**Routes:** new project wizard (`/projects/new`); resumable setup (`/[projectId]/setup`) for untyped projects  
**Job:** Name the project, pick how it runs, then create it in one submit.

---

## Flow

1. **Details** (`/projects/new`) — name, optional description, workspace (existing or create). Nothing is written yet.
2. **Type** — **Compose** / **Services** / **Repository** / **Template** / **Managed** (not “Docker Compose”, “From Template”, or “Managed Service”)
3. **Repository picker** — only for **Repository**: pick a connected repo and, optionally, a branch, then **Continue**
4. **Lane step** — only for **Repository**: TurboPanel reads the repo and asks what to run it as, showing the evidence for each answer
5. **Catalog or compose draft** — template or managed engine pick, or a compose draft; **Create project** writes the project with its final type

Progress: wizard steps inside one screen — no numbered step chips. Back walks the wizard; a **Cancel** text link under the panel always returns to projects.

## Compose step is the project screen

Choosing **Compose** does not open a wizard-shaped editor. It renders the
project's **own** surface against an unsaved draft — `ProjectProvider` takes a
`draft`, and `ProjectShell` + `ProjectOverviewTab` mount exactly as they do for
a saved project:

- Same **content width** (`layout.contentMaxWidth`), not the 440 form column
- Same **header**: `Projects ›` breadcrumb, type glyph, editable project name
  (the rename writes back to the wizard's name field, not a PATCH)
- Same **Overview · Compose · Services** section tabs — Overview included
- Same editor, lint panel, and graph view

Differences, and only these: section tabs are local state (there is no URL to
navigate), the surface shows **no Save** (nothing to patch yet), scope chips and
the environments panel are hidden (nothing to scope to yet), and every
project-scoped query is parked so the synthetic id never reaches the API.

It opens on the tab the type card promised — **Compose** or **Services**, never
Overview. Overview is still one tab away; it is just not where drafting starts,
because the operator already said which surface they wanted.

Actions sit in a footer below the shell, aligned to the shell's own content
column: **Back** on the left, **Create project** on the **bottom right**.
Create is the single commit for this step — never put it in the compose
surface's toolbar. It disables while the YAML will not parse.

## Type cards

Leading outline SVG (never emoji) beside each label, accent when selected, and
**vertically centered against the whole card** — not top-aligned to the label
line, which leaves it floating when the description wraps to two lines.

Order is fixed: **Compose, Services, Repository, Template, Managed** — the
three compose lenses, then the two catalog cards. **Compose must stay first:**
`parsePreselectedChoice` resolves a bare `?type=docker-compose` to the first
card offering that type, and that link has always meant the blank YAML slate.

| Choice | Project type | Label | Icon | Opens on | Copy |
|--------|--------------|-------|------|----------|------|
| `compose` | `docker-compose` | Compose | Feather / quill | Compose tab | A blank slate. You define the whole stack in YAML. |
| `services` | `docker-compose` | Services | Compose surface's own Services glyph (2×2 squares) | Services tab | The same stack, defined with service cards instead of YAML. |
| `repository` | `docker-compose` | Repository | Branch line with two commit nodes | Lane step, then the compose surface | Read a repository you've connected — its compose file, a site, or an app. Pick the repo and branch. |
| `template` | `template` | Template | Page layout blocks | Overview | A ready-made stack from the catalog. |
| `managed` | `managed` | Managed | Database cylinder | Overview | Fully configured on your own servers — provisioning, backups, and connections included. |

Copy voice: plain and factual — two short beats per card, what it is then what
you do. No swagger, no first-person bragging, no winking asides. Name **YAML**
explicitly on both compose cards; it is the one word that tells the two apart at
a glance.

**Managed is not "databases".** The catalog is engines today and is meant to
grow past them, so the card describes the *treatment* (fully configured) rather
than the thing. Do not write "database" on it, and do not name engines.

**TurboPanel is self-hosted, and the copy must never forget it.** The operator's
own servers run every container. Managed means TurboPanel *configures* the
engine — provisioning, pooling, backups, connection details — not that
TurboPanel hosts or runs it. Never write "we run it", "we host it", or anything
that implies our infrastructure is in the path.

`choice` is the React key for these cards. Compose and Services deliberately
share a `type`, so keying off `type` produces duplicate keys.

**Compose, Services, and Repository are one project type.** They differ only
in what the draft starts as and which tab of the compose surface opens — someone
who thinks in service cards, or in repositories, never has to meet raw YAML to
start. The Services card reuses the section tab's own glyph so the card and the
tab it lands on read as the same thing.

The repository glyph is a **branch**, never a provider mark. The card offers
whatever the organization has connected — GitHub, GitLab, a bare deploy key —
so a vendor logo would promise the wrong thing.

Do not name engines on the Managed card or advertise Redis / ClickHouse as coming.

## Repository step

The only card with a step of its own before the compose surface. It stays in the
**440 form column** inside the same `GlassSurface` panel as Details, and asks
for exactly two things:

| Field | Control | Notes |
|-------|---------|-------|
| Repository | `FormSelect` | Matches Sources — these lists grow with the account, so never a chip strip. A sole connected repository is preselected, the same courtesy the details step extends to a sole workspace |
| Branch | `TextField` | Optional. Placeholder and hint name the repository's own `defaultBranch`; empty means that default |

Footer is **Back** / **Continue**, not Create — Continue seeds the draft and
opens the compose surface, which keeps the single Create. A short muted line
under the fields says what Continue produces, so the seeded service is not a
surprise when the surface opens.

**Connecting a repository is not offered here.** A `source` row is org-owned —
several services share one, and the auto-deploy policy lives on the row — so
that flow has exactly one home, the Sources page. With nothing connected this
step is an `InlineNotice` linking to `projectSourcesHref(orgId)`; it never grows
a second connect surface that would have to stay in sync with the first.

Footer on both repository steps is **Back** / **Continue**. Back from the lane
step returns to the picker; Back from the compose surface returns to the lane
step, so a changed answer does not mean re-choosing the repository blind.

## Lane step

**Detect, then confirm — never one or the other.** Pure detection is wrong: a
repository can hold a `Dockerfile` *and* a `package.json` *and* a
`public/index.html`, and the operator's intent is not in the files. Pure asking
is also wrong: once the repository has been read, hiding what was found is
perverse.

So: four cards, always all four, in a **fixed order** (Compose, PHP site, App,
Static site) that does not reshuffle as the read lands. The detected lane is
preselected and badged **Detected**; every card carries the evidence that did or
did not choose it — `docker-compose.yml`, `composer.json`, `no package.json
found`. That evidence line is the point of the screen: it is what turns an
override into an informed act rather than a guess between four blank options.

| Lane | Seeds | Detected by |
|------|-------|-------------|
| Compose | the repository's **own** compose document, unchanged | any `docker-compose.yml` / `compose.yaml` |
| PHP site | `serviceKind: site` + engine + `php.version` | `composer.json` or `index.php` |
| App | `serviceKind: node` + source binding | `package.json` / `deno.json` / `pyproject.toml` |
| Static site | `serviceKind: site`, no PHP | `index.html`, `public/`, `dist/` |

**The compose lane seeds no `x-turbopanel` at all.** What the operator authored
upstream must not silently acquire TurboPanel metadata on import. Every other
lane is host-native (`site` / `node`) because a compose service needs `image` or
`build` unless it is host-native or Railpack-built — a bare binding would be
rejected on Create with `compose_invalid`.

**A failed read is not a dead end.** The step shows an `InlineNotice` and drops
the evidence badges, but every lane stays selectable: blocking a project over a
provider hiccup would be worse than asking. Likewise the Compose lane falls back
to Static when the repository's YAML will not parse — TurboPanel did not write
that file, so it can be anything.

**Reading is opt-in and commit-addressed.** `GET /sources/:id/inspect` fires
once, on Continue from the picker — never from rendering it — and is cached by
`(sourceId, ref)` so stepping back and forth reuses the answer. The probe set is
fixed server-side: a caller-supplied path list would widen what a compromised
session can learn from "do these filenames exist" to "read any file in any
connected repository".

**Resumable setup does not offer this card.** `/[projectId]/setup` configures an
existing row through `configureProject` (`{ type, code }`, no `options.compose`)
and has no compose draft step, so the binding would be silently dropped. It
filters the card out; an operator there picks Compose or Services and binds the
repository on the service itself.

## Layout (Details step)

- **Centered single column** — `maxWidth: 440`, horizontally centered (`alignSelf: 'center'`), top-aligned in the org content area
- **No ScrollView of its own.** `OrgScreenScroll` is the org Stack's `screenLayout`: it already scrolls every org screen and already applies the page's vertical and horizontal insets. Nesting a second vertical ScrollView leaves the inner one unbounded on native, so `flexGrow: 1` + `justifyContent: 'center'` padded the page with dead space above and below on iOS and produced a second scroll surface. Page-level sections use **horizontal** ScrollViews only (wide tables); vertical scrolling is the shell's job.
- Compact **GlassSurface** panel (not a full-bleed `SectionPanel`); short centered page title + one-line subtitle above the panel
- Density closer to auth create flows than dense fleet tables — keep fields tight, avoid long panel hints
- Description is always visible as a **2-line multiline** field (`minHeight` ~72) so longer copy is obvious
- Single user workspace → quiet summary row (no tall picker list); multiple → compact scrollable list (`maxHeight` ~160)
- Workspace segment chips stretch full panel width
- **Cancel** text link under the panel → back to projects (keep it; do not replace it with a second Cancel button)

## Details step fields

- **Name** (required) — unique within the organization (trim + case-insensitive; enforced by API)
- **Description** (optional) — always-visible 2-row multiline input
- **Workspace** — segment: Existing | Create new
  - Existing: picker of visible workspaces (preselected from `?workspaceId=` / active scope / sole workspace)
  - Create new: single **Workspace name** field — mirrors the project name as they type until edited; clearing the field resumes mirroring; creates the workspace first, then the project

## UX rules

- The default environment is created with the project on the final Create — never ask the operator to create it
- Interrupted setup is resumable (open an untyped project → setup until type is set)
- Projects remain undeployed during setup
- Touch targets ≥ 44pt; one column on phone
- Surface `project_name_in_use` / `workspace_name_in_use` as plain-language field/API errors

## Anti-patterns

- ❌ Writing the project before the type is chosen (except resumable setup for already-empty projects)
- ❌ Requiring a second Production create
- ❌ Full-bleed / max-width content form on desktop
- ❌ A vertical `ScrollView` inside a page-level org section — `OrgScreenScroll` owns that
- ❌ A pull-to-refresh spinner on the wizard — there is nothing to refresh; it must not register a handler
- ❌ Vertically centering a page by growing it to the viewport; it only works on web and breaks native
- ❌ Long explanatory paragraphs in the create header
- ❌ Single-line description that hides multi-line intent
- ❌ Numbered wizard step chips (1 / 2) on create or setup
- ❌ A bespoke compose editor for the create flow — the compose step **is** the project screen
- ❌ Hiding the Overview tab, the project header, or the full content width during the compose step
- ❌ Putting the compose step's Create button in the editor toolbar instead of the bottom-right footer
- ❌ Opening the compose step on Overview when the operator chose Compose or Services
- ❌ Treating Services or Repository as their own project type — both are `docker-compose`, one with a different landing tab, one with a picker and a lane step before it
- ❌ A connect-a-repository flow inside the wizard — connecting is an organization act and lives on Sources
- ❌ A provider logo on the Repository card — it is a branch glyph; the card is provider-agnostic
- ❌ Putting Repository before Compose in the card order — a bare `?type=docker-compose` resolves to the first card offering the type
- ❌ Offering the Repository card in resumable setup, where nothing can carry the binding
- ❌ Adopting the repository's compose as a read-only document the operator cannot edit — the compose step **is** the project screen
- ❌ Choosing a lane without showing the evidence that chose it
- ❌ Reshuffling the lane cards as the read lands — the order is fixed; "Detected" says which one won
- ❌ Reading the repository on every keystroke — `/inspect` fires once, on Continue, keyed by `(sourceId, ref)`
- ❌ Offering a lane whose daemon path does not exist yet
- ❌ Passing a caller-supplied path list to `/inspect` — the probe set is fixed server-side
- ❌ Keying the type cards off `option.type` — Compose and Services share it; key off `option.choice`
- ❌ Copy implying TurboPanel hosts or runs anything ("we run it", "we host it") — it is self-hosted
- ❌ Calling Managed "a database" — it is whatever the catalog offers, described by its treatment
- ❌ Separate draft/runtime status field
- ❌ Naming Redis / ClickHouse as coming on the Managed type card
