# Page Override: Project Create

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/projects/new` and `/[projectId]/setup`.

**Routes:** new project (`/projects/new`); set up the first environment (`/[projectId]/setup/environment`); resumable setup (`/[projectId]/setup`) for untyped projects  
**Job:** Name the project and pick where it comes from on one screen, then fill in its first environment and deploy it.

---

## Flow

1. **New project** (`/projects/new`, screen A) — one screen: **Project name** and **Workspace** (prefilled when there is one to pick; a description sits behind **Add a description**) at the top, then **Start from**: three main cards — **From a Git repository**, **Compose**, **Managed database** — and a **More ways to start** link that opens the other three: **Hosting upload**, **Template**, **Service forms**. All six stay reachable, and a `?type=` link picks its card up front (and opens the list when the card is in it). What the picked card needs shows inline under the cards:
   - **From a Git repository**: the repository picker, then the branch, then **Run it as** — the four lanes with their evidence, the detected one pre-picked, and the build settings for App and Static site. **Continue** creates the project and opens screen B.
   - **Compose**, **Service forms**, **Hosting upload**: **Continue** opens the full Compose editor (the project's own screen, below); its **Create project** makes the project and opens screen B.
   - **Template**, **Managed database**: the catalog pick inline; **Create project** makes the project and opens it (a managed database's own setup asks for the server, external access and backups).
2. **Set up production** (`/[projectId]/setup/environment`, screen B) — the first environment, which was created with the project: its name, the server, the first hostname, the Hosting Account and the variables, all prefilled where TurboPanel can tell, then **Deploy** behind the plain confirm. **Save without deploying** keeps what was set and opens the environment.

One column at one width throughout (640), a left-aligned v4 `PageTitle`, and a footer with **Cancel** (or **Back**) on the left and the primary action on the right. No numbered step chips, and no promise of a number of screens or steps.

## Compose step is the project screen

Choosing **Compose**, **Service forms** or **Hosting upload** and pressing
Continue does not open a wizard-shaped editor. It renders the
project's **own** surface against an unsaved draft — `ProjectProvider` takes a
`draft`, and `ProjectShell` + `ProjectOverviewTab` mount exactly as they do for
a saved project:

- Same **content width** (`layout.contentMaxWidth`), not the 640 form column
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

## Set up production (screen B)

`/[projectId]/setup/environment` (`project-create/environment-setup-section.tsx`
over the form in `environment-setup-form.tsx`; rules in
`src/lib/project-create/environment-setup.ts`). Title **Set up {environment}**,
one line naming the project. Sections, each prefilled where TurboPanel can
tell and never guessed where it cannot:

| Section | Prefill | Saved as |
|---------|---------|----------|
| Where it runs | Environment name (the one the project got, with the Organization Default pill); server = the environment pin, else the project default, else the only connected server | `PATCH /environments/:id` `name`, `serverId` |
| Hostname | What the service already declares (a repository's own compose can); **Answered by** only when there are several services (sites and apps first); **Also answer www.…** on by default when the name has a www spelling | The environment compose: `x-turbopanel.hosting` on that service. The hosting row is made on deploy; later changes go in the Hosting tab |
| Hosting Account | The accounts the compose declares, each a fact with **Change** (renames the alias; the account is made on the first deploy) | The environment compose |
| Variables | Empty with **Add variable** (the repository read has no example env file to fill it from). Each has a name, a value, Secret, and Run / Build and run / Build (`VariableUseChoice`) | One create per variable on the environment |

Footer: **Save without deploying** (secondary) and **Deploy {environment}**
(primary, needs a server). Both send the one environment PATCH and the
variables first; Deploy then opens the plain deploy confirm
(`PreviewDeploymentModal`, "Show what will run" folded), and both end on the
environment, whose Overview shows the deploy as it runs.

## Type cards

Leading outline SVG (never emoji) beside each label, accent when selected, and
**vertically centered against the whole card** — not top-aligned to the label
line, which leaves it floating when the description wraps to two lines.

**Shown order:** the three main cards **From a Git repository, Compose, Managed
database** (`MAIN_SETUP_CHOICES`), then under **More ways to start** **Hosting
upload, Template, Service forms** (`MORE_SETUP_CHOICES`). A card picked from the
closed list stays on screen. **Data order** (`SETUP_TYPE_OPTIONS`) keeps
**Compose first:** `parsePreselectedChoice` resolves a bare
`?type=docker-compose` to the first card offering that type, and that link has
always meant the blank YAML slate.

| Choice | Project type | Label | Icon | Opens on | Copy |
|--------|--------------|-------|------|----------|------|
| `repository` | `docker-compose` | From a Git repository | Branch line with two commit nodes | Inline repository, branch and lane; then screen B | Build and run code from a repository you've connected. |
| `compose` | `docker-compose` | Compose | Feather / quill | Compose editor, Compose tab | A blank slate. Write or paste YAML and run any containers. |
| `managed` | `managed` | Managed database | Database cylinder | Inline catalog pick; then the project | Set up on your own servers, with backups and connection details. |
| `hosting` | `docker-compose` | Hosting upload | Feather / quill | Compose editor, Services tab | A directory and an account. Upload over SFTP and serve it: static, PHP, or WordPress. |
| `template` | `template` | Template | Page layout blocks | Inline catalog pick; then the project | A ready-made setup from the catalog. |
| `services` | `docker-compose` | Service forms | Compose surface's own Services glyph (2×2 squares) | Compose editor, Services tab | The same setup, built with service forms instead of YAML. |

Copy voice: plain and factual — two short beats per card, what it is then what
you do. No swagger, no first-person bragging, no winking asides. Name **YAML**
explicitly on both compose cards; it is the one word that tells the two apart at
a glance.

**Say "managed database".** The owner approved the plain words (2026-10-24):
the catalog is database engines today, so the card says so. Do not name
engines on it.

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

## Repository section (inline on screen A)

Picking **From a Git repository** shows, under the cards and in the same
column, exactly two things before the lanes:

| Field | Control | Notes |
|-------|---------|-------|
| Repository | `RepositoryPicker` | Matches Sources — these lists grow with the account, so never a chip strip. A sole connected repository is preselected |
| Branch | `TextField` | Optional. Placeholder and hint name the repository's own `defaultBranch`; empty means that default |

Once the read lands (or fails), **Run it as** follows with the lane cards and
their build settings. **Continue** waits for the read and for a typed branch
to settle, then creates the project with the seeded compose.

**Connecting a repository is not offered here.** A `repository` row is org-owned —
several services share one, and the auto-deploy policy lives on the row — so
that flow has exactly one home, the Git sources page. With nothing connected this
step is an `InlineNotice` linking to `projectGitSourcesHref(orgId)`; it never grows
a second connect surface that would have to stay in sync with the first.

The clone-URL lane of the picker ends in its own Connect and Back, so the
screen's footer hides while it is open.

## Lane cards ("Run it as")

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

**Reading is commit-addressed.** `GET /repositories/:id/inspect` fires once
the repository is picked, and again when the branch field settles — never on
each keystroke — and is cached by `(sourceId, ref)` so changing back reuses
the answer. The probe set is
fixed server-side: a caller-supplied path list would widen what a compromised
session can learn from "do these filenames exist" to "read any file in any
connected repository".

**Resumable setup does not offer this card.** `/[projectId]/setup` configures an
existing row through `configureProject` (`{ type, code }`, no `options.compose`)
and has no compose draft step, so the binding would be silently dropped. It
filters the card out; an operator there picks Compose or Services and binds the
repository on the service itself.

## Layout

- **One column, one width** (640) for the whole of screen A and B, top-aligned and left-aligned in the org content area; the title is the v4 `PageTitle`, never centred
- **No ScrollView of its own.** `OrgScreenScroll` is the org Stack's `screenLayout`: it already scrolls every org screen and already applies the page's vertical and horizontal insets. Nesting a second vertical ScrollView leaves the inner one unbounded on native, so `flexGrow: 1` + `justifyContent: 'center'` padded the page with dead space above and below on iOS and produced a second scroll surface. Page-level sections use **horizontal** ScrollViews only (wide tables); vertical scrolling is the shell's job.
- Footer: **Cancel** (screen A) or **Back** (Compose editor) on the left, the primary action on the right
- Touch targets ≥ 44 pt; the cards stack in one column on a phone

## Fields on screen A

- **Project name** (required) — unique within the organization (trim + case-insensitive; enforced by API)
- **Description** (optional) — behind **Add a description**; opens as a 2-line multiline field
- **Workspace** — segment: Existing | Create new
  - Existing: picker of visible workspaces (preselected from `?workspaceId=` / active scope / sole workspace)
  - Create new: single **Workspace name** field — mirrors the project name as they type until edited; clearing the field resumes mirroring; creates the workspace first, then the project
- The first environment is not named here: the project gets the organization default, and screen B renames it

## UX rules

- The default environment is created with the project on Create — never ask the operator to create it; screen B only names it
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
- ❌ A card width that changes between sections, or a centred title over a left-aligned column
- ❌ A bespoke compose editor for the create flow — the compose step **is** the project screen
- ❌ Hiding the Overview tab, the project header, or the full content width during the compose step
- ❌ Putting the compose step's Create button in the editor toolbar instead of the bottom-right footer
- ❌ Opening the compose step on Overview when the operator chose Compose or Services
- ❌ Treating Service forms or the repository as their own project type — both are `docker-compose`, one with a different landing tab, one with a picker and lanes inline
- ❌ A connect-a-repository flow inside the wizard — connecting is an organization act and lives on Sources
- ❌ A provider logo on the Repository card — it is a branch glyph; the card is provider-agnostic
- ❌ Putting another card before Compose in `SETUP_TYPE_OPTIONS` — a bare `?type=docker-compose` resolves to the first card offering the type (the shown order is `MAIN_SETUP_CHOICES` / `MORE_SETUP_CHOICES`)
- ❌ Offering the Repository card in resumable setup, where nothing can carry the binding
- ❌ Adopting the repository's compose as a read-only document the operator cannot edit — the compose step **is** the project screen
- ❌ Choosing a lane without showing the evidence that chose it
- ❌ Reshuffling the lane cards as the read lands — the order is fixed; "Detected" says which one won
- ❌ Reading the repository on every keystroke — `/inspect` fires on the pick and when the branch settles, keyed by `(sourceId, ref)`
- ❌ Offering a lane whose daemon path does not exist yet
- ❌ Passing a caller-supplied path list to `/inspect` — the probe set is fixed server-side
- ❌ Keying the type cards off `option.type` — Compose and Services share it; key off `option.choice`
- ❌ Copy implying TurboPanel hosts or runs anything ("we run it", "we host it") — it is self-hosted
- ❌ Separate draft/runtime status field
- ❌ Naming Redis / ClickHouse as coming on the Managed type card

## The Hosting card

Fourth `docker-compose` card, under **More ways to start** as **Hosting upload**. It seeds one site with
`sourceKind: managed-directory` — a webroot the account fills over SFTP — and
opens straight on the compose surface. Not a separate creation path: every
deployable resolves through `environment → service → hosting` and `service` rows
are written only by `reconcileServicesFromCompose`, so a non-compose entry point
would need a second writer, a second deploy-prepare, and second read paths. A
site already *is* "a directory and an account"; compose is just the declaration
format, and for a site it declares almost nothing.

Caddy by default, static by default: PHP is one field away on the Services tab,
and an empty `php: {}` block would be a no-op twice over, so turning it on means
naming a series.

**Copy rules.** Describe the capability, never the vintage. No "traditional",
"legacy", "classic", or "still" — PHP and WordPress hosting is a market to serve
on purpose, and those words tell that audience they are a concession. A test
asserts the card's text carries none of them.

The card may now promise SFTP, because the access subsystem landed first. That
ordering was the point: without it the card would ship a webroot nobody could
put a file into.

**The account is the missing half, and the UI says so before Deploy does.** A
managed-directory site needs a project principal stewarding its service, and
service rows do not exist until deploy-prepare — so a freshly created Hosting
project always starts unowned. The principals section renders an
`InlineNotice` naming the sites that have no account yet
(`unownedManagedDirectorySites`), which is where the fix is one control away.
Deploy-prepare still refuses the combination
(`site_managed_directory_unowned`), but that is the moment the operator presses
Deploy, not the moment they can still act.

❌ Do not add a second, non-compose "create a website" flow.
❌ Do not seed `php: {}`.
❌ Do not let the card imply TurboPanel hosts or builds anything remotely.
