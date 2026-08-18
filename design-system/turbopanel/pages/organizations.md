# Page Override: Organization switcher

> Overrides `design-system/turbopanel/MASTER.md` for `/organizations`.

**Route:** `src/app/organizations.tsx` → `organization-switcher-screen.tsx`  
**Job:** Searchable list of every organization the operator can access. Choosing a row opens that org’s **Overview**. Scales to tens of orgs (freelance / multi-client). `/welcome` is a separate home hop that sends a preferred org to Overview and everyone else here.

---

## Layout

- App chrome: T mark + account control (same header account pattern as the org shell — no org trigger here)
- Page title **Organizations**, short subtitle, **New** toolbar chip (create modal)
- Filter field (visible whenever at least one org exists)
- Scrollable list: check + **Current** on the active org, gear on every row → Manage Organization
- Empty: explanatory copy + **New**; filter miss: “No organizations match …”
- Admins: **Instance administration** link under the list

## Header menu (compact)

- Search when 2+ orgs; scrollable list; **sticky footer** **Manage** + **New** (never mixed into the list — native overlay was clipping those actions)
- **View all organizations** opens this page
- Switching an org (header or this page) goes to `/{orgId}/overview` and **replaces** the org console (no swipe-back to the previous organization)

## Anti-patterns (page-specific)

- ❌ Dumping every org plus Manage/Create into an unscrollable overlay
- ❌ Bottom sheet for this picker (header menus stay from-top / from-right)
- ❌ Color-only current org (check + Current label)
- ❌ Auto-redirecting away from this page when a preferred org exists — this is a destination
