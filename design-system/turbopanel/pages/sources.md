# Page Override: Sources

> Overrides `design-system/turbopanel/MASTER.md` for the organization
> **Projects → Sources** surface. The admin counterpart —
> instance-wide GitHub App / GitLab OAuth credentials and the webhook address
> — lives on `/admin/git` and is **not** this page.

**Surfaces:**
- Organization → Projects → **Sources**
  (`org/sources/sources-overview-section.tsx`)
- The connect-repository flow it opens
  (`org/sources/connect-repository-panel.tsx`)

**Job:** answer "which Git accounts can this organization read, and which
repositories has it connected" — and let an operator connect or disconnect one
**without opening a service**. Connecting a repository is an organization act,
not a property of the compose service that happens to build from it.

---

## Two panels, in this order

1. **Connected accounts** — one row per `git_provider_installation`. Provider,
   account login, account type, and a **Suspended** badge when the provider
   suspended the install. Connect actions live in this panel's header.
2. **Connected repositories** — one row per `source`. Repository label,
   provider, default branch, auto-deploy policy, disconnect.

The order is the dependency order: a repository cannot be picked until an
account is connected, and the empty state of panel 1 is the explanation for the
empty state of panel 2. Never render them side by side or collapse them into a
single list — an installation and a source are different objects with different
lifetimes (removing a source leaves the installation; suspending an install
leaves every source bound to it intact).

## Connecting is a browser navigation, not a fetch

`GET /sources/github/install` and `GET /sources/gitlab/oauth` both answer
**302** to the provider's consent page. The operator has to *land* there to
approve the grant, so both actions are `Linking.openURL(…)` against
`githubAppInstallUrl()` / `gitlabOauthConnectUrl()`. Never `fetch` them — the
redirect would be consumed and the operator would see nothing happen.

## The zero-installation state is not a self-service fix

With no installations, this page says the **instance administrator** has to
register the GitHub App first, as an `InlineNotice` (`tone="info"`), and offers
the `/admin/git` link **only when the session is an admin one**
(`isAdminSession`). A non-admin gets the sentence and no dead button.

The GitLab lane is different and must stay different: an organization with no
OAuth grant can still connect through a generated read-only **deploy key**, so
the GitLab action is always offered here.

## Rows

| Role | Token / component | Notes |
|------|-------------------|-------|
| Row shell | `orgPanelStyles.detailCard` | Same card as network / datacenter rows — never a bespoke tile |
| Expanded body | `orgPanelStyles.expandedSection` | Nested under the row it belongs to |
| Provider / suspension | `Badge` | Suspension is a **word**, never a colour alone |
| Repository / clone URL | `MonoText` | It is an identifier |
| Auto-deploy | `SegmentedControl` | Closed 3-value set (`SOURCE_AUTO_DEPLOY_OPTIONS`) — never a dropdown |
| Provider chooser | `SegmentedControl` | Closed 3-value set (`SOURCE_PROVIDER_OPTIONS`) |
| Connection / repository pickers | `FormSelect` | These lists grow with the account — never a chip strip |
| Disconnect | `ConfirmButton` | Two-press, per MASTER |
| Notices | `InlineNotice` | `warning` for the reachability note, `info` for the admin-setup state |

- **Expand-in-place**, never a modal: the detail is a fact about the row.
- The auto-deploy control states out loud that the policy is a property of the
  **repository** and applies to every service bound to it. It is not a
  per-service switch and must never be labelled as one.

## Reachability is fetched on expand only

`GET /sources/:id` re-resolves the instance public-URL list on every call to
produce `reachabilityNote`. Ten rows must not fan out ten of those reads, so
`useSourceDetail` is `enabled: false` by default and each row opts in **while
expanded**. The list read (`GET /sources`) deliberately carries none of the
three webhook fields.

Render `reachabilityNote` as an `InlineNotice` `tone="warning"` inside the
expanded body. Do **not** render `webhookUrl` here — the address is only
actionable where the provider credentials are edited (`/admin/git`), and
duplicating it invites an operator to paste it from the wrong surface.

## Disconnect refuses for a reason

**409** `source_referenced_by_compose` is not a retryable failure and must not
be shown as a raw error code. It becomes: *"This repository is still connected
to a service — disconnect it from the project first."* Any other failure shows
the mutation's own message.

## Permissions

Mutating controls (connect, auto-deploy, disconnect) are **disabled**, not
hidden, for a session without `organization:manage` — consistent with every
other org panel, and the server 403 remains authoritative. `useCan` is a
display hint only.

## Anti-patterns (page-specific)

- ❌ A modal for connect, disconnect, or the reachability note
- ❌ `fetch`ing the install / OAuth endpoints instead of navigating to them
- ❌ Fetching `GET /sources/:id` for every listed row
- ❌ Showing the webhook URL here (that is `/admin/git`)
- ❌ Offering an org operator a "register the GitHub App" fix they cannot perform
- ❌ Surfacing `source_referenced_by_compose` as a raw code, or as a retry
- ❌ Implying auto-deploy is per service
- ❌ Merging installations and sources into one list
- ❌ Hiding manage-gated controls instead of disabling them
