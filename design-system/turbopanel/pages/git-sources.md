# Page Override: Git sources

> Overrides `design-system/turbopanel/MASTER.md` for the organization
> **Projects → Git sources** surface and its per-application detail screen. The
> same components serve the instance-wide counterpart at `/admin/git`, which is
> the *same page at a different scope*, not a different page.

**Surfaces:**
- Organization → Projects → **Git sources**
  (`org/git-sources/git-sources-section.tsx`, `scope="org"`)
- Instance → Admin → **Git** (same component, `scope="admin"`)
- One application
  (`org/git-sources/forge-detail-section.tsx`)
- Registration (`org/git-sources/github-app-wizard.tsx`,
  `org/git-sources/forge-editor.tsx`)
- The repository picker every project screen reuses
  (`org/git-sources/repository-picker.tsx`) and its deploy-key lane
  (`org/git-sources/deploy-key-source.tsx`)

**Job:** answer "which Git **applications** can this organization use, and what
has each one actually been allowed to see" — nothing more. Repositories are
deliberately absent.

---

## The page lists applications. It does not list repositories.

This reverses the previous design and the reversal is the point. A `repository` row
is created when a project attaches a repository and is reused when a second
project attaches the same one; it is never registered in advance, never listed,
and never disconnected from a page of its own. An operator who has to connect a
repository *before* they can use it has to guess which repositories a project
will want, and the list they build is stale the moment they finish.

So: no **Connected repositories** panel, anywhere. If a screen needs to name a
repository, it names the one that service is bound to, in place.

## Registering and installing are two acts, and the gap is the failure

A GitHub App that exists but has never been installed looks completely
configured — it has a name, a slug, credentials, a webhook URL — and can see
exactly zero repositories. That is the single most likely way an operator gets
stuck, so the application detail screen names it outright:

> **Complete GitHub installation** — Repository access has not been installed
> yet. Complete this step before attaching the source to an application.

as an `InlineNotice` carrying the **Install repositories** action. It is not a
subtle empty state and must not be softened into one.

## App names are globally unique, so the field is prefilled and editable

GitHub App names are unique across all of GitHub, so a default of "TurboPanel"
fails for everyone but the first instance. The wizard prefills
`turbopanel-<word>-<code>` (`src/lib/github-app-name.ts`) into an editable
field. Never a fixed name, and never a name the operator cannot change — the
generated one is a starting point, not a constraint.

## The wizard is two steps, in this order

1. **Identity** — name, owner (personal account or a `github.com` organization
   **slug**, which is *not* a TurboPanel organization id), **System wide**
   (instance admins only; it also decides the manifest's `public` flag), and a
   collapsed **Self-hosted / Enterprise** disclosure for the HTML URL, API URL,
   custom git user, and custom git port.
2. **Webhook** — the public-URL endpoint, the resolved delivery URL previewed
   in `MonoText`, and **Preview deployment access** (*Do not update pull
   requests* / *Read and update pull requests*).

Then **Register with GitHub**, which **form-POSTs** the manifest. GitHub creates
the App with the webhook already set and hands back every credential in one hop.

Step 2 exists because the webhook address is a decision, not a display: an
instance with several public URLs has to say which one the provider can reach.

## Provider round-trips end in the console, never on JSON

Registration and installation both come back through the control plane, which
**302**s to the application detail screen with `?installed=` or `?error=`. The
screen consumes those params once and renders an `InlineNotice`. An operator
must never land on an API response — that reads as a crash.

Connect actions themselves are `Linking.openURL(githubAppInstallUrl() |
gitlabOauthConnectUrl())`. Both endpoints answer **302** to the provider consent
page, so they are navigated to, never `fetch`ed — a fetch consumes the redirect
and nothing appears to happen.

## Picking a repository is a three-level hierarchy

**application → account → repository**, in `repository-picker.tsx`, everywhere a
repository is chosen. Not a flat list: an operator running two Apps, each
installed on several accounts, cannot tell two `acme/api` repositories apart
from a flat list, and picking the wrong one binds a project to a repository it
may not be able to clone. Each level narrows the next, and a level with exactly
one option collapses so the common setup stays one click.

The picker *attaches* on pick (`POST /repositories/attach`, idempotent), so the
caller gets a `sourceId` before it saves anything that names one — an unknown
`sourceId` fails the compose lint outright.

## The deploy-key lane stays reachable

A self-hosted GitLab, a Gitea, or a plain SSH remote has no App to install and
no installation to enumerate. `deploy-key-source.tsx` is offered **beside** the
App lane in the picker — a ghost button under the selects, and an action in the
"no applications yet" notice — never behind a setting or an admin-only screen.

Its two steps keep their order: generate the key **first**, so the public half
is on screen before the binding exists. The public half is returned once and
never again; a binding created first would be unable to clone until the operator
went looking for a key they can no longer retrieve.

## Sync exists because GitHub will not tell us

An operator can rename an App on GitHub and nothing informs the instance. The
slug also builds the install link, so a rename quietly stops new accounts from
connecting. **Sync from GitHub** on the detail screen re-reads `GET /app`; it
reports the name it found rather than silently succeeding.

## Rows and controls

| Role | Token / component | Notes |
|------|-------------------|-------|
| Row shell | `orgPanelStyles.detailCard` | Same card as network / datacenter rows — never a bespoke tile |
| Registration form | expand-in-place | Never a modal; a wizard step is a step, not a dialog |
| Wizard stepper | `ui/wizard-steps.tsx` | Shared kit — the same one `add-server-wizard.tsx` uses |
| Provider / suspension / scope | `Badge` | Suspension is a **word**, never a colour alone |
| Webhook URL, clone URL, account login | `MonoText` + `CopyButton` | They are identifiers, and the webhook URL exists to be pasted |
| Application / account / repository | `FormSelect` | These lists grow with the account — never a chip strip |
| Preview deployment access | `SegmentedControl` | Closed 2-value set |
| Delete | `ConfirmButton` | Two-press, per MASTER |
| Notices | `InlineNotice` | `warning` for reachability and failed round-trips, `info` for a completed connection |

## The webhook URL belongs on the detail screen

It moved here from `/admin/git` because an application is what a delivery names.
Each application shows its own address, with the reachability note underneath,
rendered **only on resolved data**: `usePublicUrlsOptional()` returning
`undefined` is a loading row and a real failure is an error notice. Feeding `[]`
from an unresolved query would tell a correctly configured operator they have no
public URL.

## Permissions and scope

Instance-wide applications appear in the organization list as `readOnly` rows —
visible and usable, not editable. **System wide** in the wizard is offered to
instance admins only. Mutating controls are **disabled**, not hidden, for a
session without `organization:manage`; the server 403 remains authoritative and
`useCan` is a display hint.

The admin detail screen (`/admin/git/[appId]`) hides **Repository access**
entirely. An installation belongs to an organization, so an instance-wide view
has no account list of its own — showing one would show somebody else's.

## Anti-patterns (page-specific)

- ❌ A **Connected repositories** panel, or any surface for managing `repository` rows
- ❌ A flat repository list instead of application → account → repository
- ❌ A default App name that is not unique, or one the operator cannot edit
- ❌ Landing the operator on API JSON after a provider round-trip
- ❌ `fetch`ing the install / OAuth endpoints instead of navigating to them
- ❌ Hiding the deploy-key lane behind the App lane
- ❌ Creating the binding before showing the deploy key's public half
- ❌ Softening the "installed but never installed on an account" state
- ❌ Rendering the reachability note from an unresolved public-URL query
- ❌ A modal for registration, installation, or the reachability note
- ❌ Hiding manage-gated controls instead of disabling them
