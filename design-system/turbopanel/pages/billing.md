# Page Override: Billing

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/billing`.

**Route:** `src/app/[orgId]/billing/index.tsx` → `billing-section.tsx`  
**Job:** Hosted-only subscription management — buy the first seats, see seats vs licenses per tier, move one license between tiers, add or release seats, and hand off to the Stripe Customer Portal for invoices and payment methods.

**Availability:** `GET /api/client/v1/status` `billingEnabled` gates the whole area. Self-hosted answers `false`: the sidebar omits the entry and the route redirects to Overview — never an error page, never a probe of `/billing/*` (every route 503s `billing_not_configured` there). `billing` is **not** in `ORG_TAB_AREA_IDS`; native reaches it by deep link only, like Managed / Network / Access.

**Skill search note:** the `ui-ux-pro-max` design-system search for this surface returned the marketing *Pricing-Focused Landing* pattern (3 tier cards, annual-discount badges, FAQ). Per the decision order that is not adopted — this is the ops console, not `~/website`. What was kept from the skill: the a11y checklist (announced errors, visibly distinct disabled states, loading → success/error feedback on every submit, no colour-only status, keyboard focus).

---

## Layout

- Page title `Billing` (`panelStyles.pageTitle`) + one line of copy naming **TurboPanel High Availability** (`HA_PRODUCT_NAME` — never bare "HA")
- A return-from-Stripe `InlineNotice` at the top when `?checkout=cancel` (warning) or `?checkout=success` **and** the projection already shows the subscription (info)
- **Confirming payment** (`?checkout=success` with no live subscription yet): Stripe redirects back before its webhook lands, so this state renders a `SectionPanel` with a `LoadingState`, a **Refresh** button, and a ghost **Checkout did not complete** escape back to the tier table — never the checkout panel itself, which would let a second click buy a second subscription (the server only refuses `subscription_exists` from the projection). This is the page's one poll: `useBillingSubscription` refetches every `CHECKOUT_CONFIRM_POLL_MS` (5 s) only while in this state, the same conditional-interval shape as managed status while `provisioning`.
- Then **one of two bodies**, decided by `hasLiveBillingSubscription()` (ended statuses — `canceled`, `incomplete_expired`, `unpaid` — count as *no* subscription so checkout is offered again):

### No subscription

1. **Choose a tier** (accent `SectionPanel`): an `InlineNotice` with the sizing one-liner (`nproc && free -g`, `CopyButton` in the notice actions, the command repeated in `MonoText`), then the catalogue as a `DataTable` — columns Tier (mono) · Per seat · Fits up to (cores · GiB) · Monitored slots. Rows select in place (`DataTableRow selected`); custom (`isCustom`) rows render but do not select, with one muted line explaining they are negotiated.
2. **Start a subscription**: chosen tier read-out, a `TextField` for seats (whole number ≥ 1), primary **Continue to checkout**. The hosted Checkout URL replaces the tab on web (`location.assign`) and opens via `Linking` on native — Stripe returns to this page, so a second tab would only leave a stale console behind.

### Live subscription

1. **Past-due strip** (`InlineNotice` warning, only when `status === 'past_due'`): names the grace expiry (`graceExpiresAt`) and carries the single allowed action — **Update payment method** → Customer Portal. While past due every tier picker and seat addition on the page is disabled with a muted line saying why; seat releases stay allowed (they are deferred and never invoiced).
2. **Subscription** (accent panel, status `Badge` in `headerRight`): `StatTiles` Seats · Licensed · Free summed across tiers, period end in the hint, `pastDueSince` when set, the **pending changes** list (`describePendingChange` — one sentence per intent, server-named when the license is bound), and **Invoices & payment method** → Portal. The portal button is hidden while `payer` is `null` (the route 404s until the first payment records a customer).
3. **`<tier> seats`** — one `SectionPanel` per `tiers[]` row: `StatTiles` Seats · Licensed · On a server · Free, then **Add a seat** (preview → `InlineNotice` quoting Stripe's `amountDue` / subtotal / tax / total verbatim, followed by an **Invoice lines** list — one row per `preview.lines[]` entry with the provider's description, a **Credit** / **Debit** `Badge` from the sign of `amount`, a **Prorated** `Badge` when `proration` is set, and the signed amount in `MonoText` → **Confirm and pay**) and **Release a seat** (warning notice: drops at the period end, no credit → **Confirm release**).
4. **Move a license to another tier**: `Select` server (only servers with a `licenseId` and a `tierPlacement.licenseTier`; detail line shows current / required / recommended), `Select` target tier (current tier disabled). Direction comes from catalogue `rank` (`tierChangeDirection`), never from label text:
   - **Upgrade** — preview runs on selection; `InlineNotice` (info) with the quote verbatim and the same **Invoice lines** list as seat additions (every provider line with its signed amount and Credit / Debit / Prorated badges, so the credit for the unused remainder of the old tier and the debit for the new one are checkable before paying); **Confirm upgrade and pay** sends the preview's `prorationDate` back. A `pending: true` answer, or an `upgrade` intent already in `pendingChanges` for that license, renders a `LoadingState` "Applying the tier change — waiting for payment confirmation" and keeps confirm disabled until the projection (invalidated on success, webhook-driven) drops the intent. Never optimistic success.
   - **Downgrade** — no preview; `InlineNotice` (warning) stating it applies at `currentPeriodEnd` with no credit and that devices beyond the lower tier's slots stop being monitored; **Schedule downgrade**.
   - A license with any pending change shows an info notice describing it and disables the picker (the API refuses a second change with `license_has_pending_change`).
5. Deep link: `?tier=<id|label>&license=<licenseId>` (from the server detail **Upgrade to Sn** button) pre-selects both. The `license` pre-selection is *derived*, not seeded: the servers list usually resolves after the panel mounts, so the panel keeps resolving `?license=` against the current server options until the operator picks a server themselves — a manual pick wins from then on. A quote only fires from the tier picker's own change, so with both pre-filled and nothing quoted yet a primary **Review upgrade / Review downgrade** button runs the same step. `?tier=` alone pre-selects the tier in the checkout table when there is no subscription yet.
6. Delinquency follows the control plane's set (`past_due`, `unpaid` — both still live); ended statuses (`canceled`, `incomplete_expired`) fall back to the checkout body.

## Density

- Dense table for the catalogue; per-tier seat panels use `StatTiles` (fill-only, inside the panel) — never a bordered card-in-card
- Money is `Intl.NumberFormat` currency from the provider's minor units and currency (`formatMinorUnits`); the client **never sums, prorates or rounds** — every figure shown is a field from the preview or the projection. **Assumption:** the catalogue (`BillingTier.priceCents`) carries no currency field, so `formatTierPrice` renders list prices as USD; quotes and invoices use the provider's own `currency`
- Dates via `formatLocalDateTime`; tier labels in `MonoText` where they sit in a table

## States

| State | Presentation |
|-------|----------------|
| Loading | `LoadingState` "Loading billing…" |
| `billing_not_configured` | `EmptyState` (panel) — should not be reachable because the route redirects, kept for a stale status cache |
| Load error | `EmptyState` + Retry |
| Checkout returned | Info (success) / warning (cancel) `InlineNotice` |
| Past due | Warning strip + all entitlement-raising controls disabled |
| Applying upgrade | `LoadingState` row inside the move panel |
| Mutation error | `panelStyles.error` text beside the button that failed; the code (`subscription_past_due`, `seats_in_use`, …) stays in the message |

## Motion

- Standard button press feedback only; no transitions on state swaps
- Busy buttons show the shared spinner (`busy` / `busyLabel`)

## Anti-patterns

- ❌ Probing `/billing/*` to discover availability — read `billingEnabled` from status
- ❌ Polling the subscription — it is webhook-driven; invalidate on mutation success (the only exception is the bounded checkout-confirmation poll above)
- ❌ Rendering the checkout panel under a `checkout=success` return before the projection confirms the subscription
- ❌ Computing any amount client-side (price × seats, proration, credit) — show the preview verbatim
- ❌ Marking an upgrade applied before the projection confirms it
- ❌ Building an invoice list — the Customer Portal owns invoices and payment methods
- ❌ Bare "HA" / "High Availability" in copy
- ❌ Marketing pricing-card layouts, "most popular" badges, annual-discount ribbons
