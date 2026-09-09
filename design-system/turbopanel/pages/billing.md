# Page Override: Billing

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/billing`.

**Route:** `src/app/[orgId]/billing/index.tsx` → `billing-section.tsx`  
**Job:** Hosted-only subscription management — buy the first licenses, see how many licenses are bought and in use (org-wide and per tier), see which servers are not covered, add or release one license at a tier, move one license between tiers, and hand off to the Stripe Customer Portal for invoices and payment methods.

**Vocabulary (owner decision):** the admin buys **licenses** for **servers**. Never "seat" in copy. A license is plumbing — it is minted by the Add server wizard and never shown as an object here, and this page never assigns a tier to a server: the instance derives each server's tier from what was bought and its hardware, and the page only reports the result. Buying is "buy a license" / "licenses at S3" and is not front and center.

**Availability:** `GET /api/client/v1/status` `billingEnabled` gates the whole area. Self-hosted answers `false`: the sidebar omits the entry and the route redirects to Overview — never an error page, never a probe of `/billing/*` (every route 503s `billing_not_configured` there). `billing` is **not** in `ORG_TAB_AREA_IDS`; native reaches it by deep link only, like Managed / Network / Access.

**Skill search note:** the `ui-ux-pro-max` design-system search for this surface returned the marketing *Pricing-Focused Landing* pattern (3 tier cards, annual-discount badges, FAQ). Per the decision order that is not adopted — this is the ops console, not `~/website`. What was kept from the skill: the a11y checklist (announced errors, visibly distinct disabled states, loading → success/error feedback on every submit, no colour-only status, keyboard focus).

---

## Layout

- Page title `Billing` (`panelStyles.pageTitle`) + one line of copy naming **TurboPanel High Availability** (`HA_PRODUCT_NAME` — never bare "HA")
- A return-from-Stripe `InlineNotice` at the top when `?checkout=cancel` (warning) or `?checkout=success` **and** the projection already shows the subscription (info)
- **Confirming payment** (`?checkout=success` with no live subscription yet): Stripe redirects back before its webhook lands, so this state renders a `SectionPanel` with a `LoadingState`, a **Refresh** button, and a ghost **Checkout did not complete** escape back to the tier table — never the checkout panel itself, which would let a second click buy a second subscription (the server only refuses `subscription_exists` from the projection). This is the page's one poll: `useBillingSubscription` refetches every `CHECKOUT_CONFIRM_POLL_MS` (5 s) only while in this state, the same conditional-interval shape as managed status while `provisioning`.
- Then **one of two bodies**, decided by `hasLiveBillingSubscription()` (ended statuses — `canceled`, `incomplete_expired` — count as *no* subscription so checkout is offered again; `unpaid` is delinquent but still live):

### No subscription

1. **Choose a tier** (accent `SectionPanel`): an `InlineNotice` with the sizing one-liner (`nproc && free -g`, `CopyButton` in the notice actions, the command repeated in `MonoText`), the **servers not covered** notice (below) when the org already has servers, then the catalogue as a `DataTable` — columns Tier (mono) · Per license · Fits up to (cores · GiB) · Monitored slots. Rows select in place (`DataTableRow selected`); custom (`isCustom`) rows render but do not select, with one muted line explaining they are negotiated. `?tier=` preselects a row.
2. **Buy the first licenses**: chosen tier read-out, a `TextField` for the number of licenses (whole number ≥ 1), primary **Continue to checkout**. The hosted Checkout URL replaces the tab on web (`location.assign`) and opens via `Linking` on native — Stripe returns to this page, so a second tab would only leave a stale console behind.

### Live subscription

1. **Past-due strip** (`InlineNotice` warning, only while delinquent): names the grace expiry (`graceExpiresAt`) and carries the single allowed action — **Update payment method** → Customer Portal. While past due every +1, buy and move control on the page is disabled with a muted line saying why; −1 releases stay allowed (they are deferred and never invoiced).
2. **Licenses** (accent panel, status `Badge` in `headerRight`, period end in the hint): `StatTiles` Purchased · In use · Available · Leaving from `summary.licenses`, one line under them (`licenseSummaryLine`: "3 of 5 licenses in use · 2 more servers can be added · 1 leaving at period end"), `pastDueSince` when set, the **pending changes** list (`describePendingChange` — one sentence per `downgrade` / `release-seat` intent, dated from `landsAt`, "at the end of the current period" when it is null), and **Invoices & payment method** → Portal. The portal button is hidden while `payer` is `null` (the route 404s until the first payment records a customer).
3. **Servers not covered** (`InlineNotice` warning, hidden when empty): from `summary.servers` where `assignedTierId` is null — each server by name (org servers list, falling back to the id) with the tier its hardware needs (`requiredTier`, or "has not reported hardware yet"). Read from the projection's placement, never re-derived client-side.
4. **Licenses by tier** — one `DataTable` from `summary.tiers[]`: Tier (mono) · Per license · Purchased · In use · Leaving, and per row **+1** (preview → `InlineNotice` quoting Stripe's `amountDue` / subtotal / tax / total verbatim, followed by an **Invoice lines** list — one row per `preview.lines[]` entry with the provider's description, a **Credit** / **Debit** `Badge` from the sign of `amount`, a **Prorated** `Badge` when `proration` is set, and the signed amount in `MonoText` → **Confirm and pay** posts `seats` `delta: +1` with the quoted `prorationDate`) and **−1** (warning notice: leaves at the period end, no credit → **Confirm release** posts `delta: −1`; a **409** `servers_uncovered` answer renders "web-1 needs S5 and would be left uncovered. Move a license up to S5 or buy one there first." via `describeBillingRefusal`). Below the table, **Buy a license at another tier** — a `Select` of purchasable tiers the org has not bought at (preselected by `?tier=` when it names one) and a **Buy one** button that runs the same +1 path. Kept below the table on purpose: buying is not front and center.
5. **Move a license**: `Select` from tier (bought tiers with something left to move; detail line shows purchased / in use / price) and `Select` to tier (purchasable catalogue tiers, the from tier disabled). Direction comes from catalogue `rank` (`tierChangeDirection`), never from label text. The body is `{ fromTierId, toTierId }` — a quantity moves, never a named license or server:
   - **Upgrade** — preview runs on selection; `InlineNotice` (info) with the quote verbatim and the same **Invoice lines** list as +1; **Confirm upgrade and pay** sends the preview's `prorationDate` back. `pending: true` means Stripe parked the change; the projection (invalidated on success, webhook-driven) is the only source of truth — never optimistic success.
   - **Downgrade** — no preview; `InlineNotice` (warning) stating it lands at `currentPeriodEnd` with no credit and is refused if a server would be left on nothing; **Schedule downgrade**.
   - `?tier=` preselects the to tier; the from tier is always the operator's pick, and the quote fires from the picker's own change.
6. Delinquency follows the control plane's set (`past_due`, `unpaid` — both still live); ended statuses (`canceled`, `incomplete_expired`) fall back to the checkout body.

## Density

- Dense tables for the catalogue and the per-tier counts; the org-wide totals use `StatTiles` (fill-only, inside the panel) — never a bordered card-in-card
- Money is `Intl.NumberFormat` currency from the provider's minor units and currency (`formatMinorUnits`); the client **never sums, prorates or rounds** — every figure shown is a field from the preview or the projection. Catalogue and per-tier prices carry their own `currency` (cached from the provider; `usd` when absent); quotes and invoices use the provider's own `currency`
- Dates via `formatLocalDateTime`; tier labels in `MonoText` where they sit in a table

## States

| State | Presentation |
|-------|----------------|
| Loading | `LoadingState` "Loading billing…" |
| `billing_not_configured` | `EmptyState` (panel) — should not be reachable because the route redirects, kept for a stale status cache |
| Load error | `EmptyState` + Retry |
| Checkout returned | Info (success) / warning (cancel) `InlineNotice` |
| Past due | Warning strip + all entitlement-raising controls disabled |
| Servers not covered | Warning `InlineNotice` naming each server and the tier it needs |
| Fetching a quote | `LoadingState` row inside the move panel |
| Mutation error | `panelStyles.error` text beside the button that failed. A known refusal (`servers_uncovered`, `licenses_in_use`, `subscription_past_due`, `billing_mutation_in_progress`, …) is rendered as what to do next (`describeBillingRefusal`); anything else shows the raw message with the code in it |

## Motion

- Standard button press feedback only; no transitions on state swaps
- Busy buttons show the shared spinner (`busy` / `busyLabel`)

## Anti-patterns

- ❌ Probing `/billing/*` to discover availability — read `billingEnabled` from status
- ❌ Polling the subscription — it is webhook-driven; invalidate on mutation success (the only exception is the bounded checkout-confirmation poll above)
- ❌ Rendering the checkout panel under a `checkout=success` return before the projection confirms the subscription
- ❌ Computing any amount client-side (price × licenses, proration, credit) — show the preview verbatim
- ❌ Marking an upgrade applied before the projection confirms it
- ❌ Saying "seat", showing a license id or token, offering a tier picker on a license, or assigning a tier to a server from the client
- ❌ Building an invoice list — the Customer Portal owns invoices and payment methods
- ❌ Bare "HA" / "High Availability" in copy
- ❌ Marketing pricing-card layouts, "most popular" badges, annual-discount ribbons
