# Page Override: Variables

> Overrides `design-system/turbopanel/MASTER.md` for environment/project variable panels.

**Components:** `variables-section.tsx` (environment scope), `project-variables-section.tsx` (project scope on project detail)  
**Job:** Add/edit/delete vars and secrets for compose substitution.

---

## Layout

- **Project detail:** inheritance chip “Inherited by all environments unless overridden…”
- **Common keys** preset chips (PORT, NODE_ENV, DATABASE_URL, …) — one tap pre-fills add form  
- Table header row: Key | Value  
- Secret badge + write-only values (`••••••••`)  
- Add form toggles inline; never show secret values after create

## Copy

- Hint: “Injected into compose at deploy — lower scopes override”  
- Empty state mentions `${KEY}` compose references

## Anti-patterns

- ❌ Pre-filling secret values on edit  
- ❌ Modal-only add flow (keep inline)  
- ❌ Hiding inheritance hint
