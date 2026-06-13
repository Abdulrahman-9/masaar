# Masaar (مسار) — Monorepo

Bilingual (AR-RTL default / EN-LTR) contractor & tender management platform digitizing
**SCPP Rev 1.0** for petroleum-sector procurement. Design reference: `../_handoff_masaar_website/`
(direction board: `Masaar Design Direction Board v2 (AR-EN).html`; full plan: `BUILD_PLAN.md`).

## Layout

| Path | Package | What it is |
|---|---|---|
| `packages/tokens` | `@masaar/tokens` | Design tokens — `css/tokens.css` (source of truth) + TS mirror |
| `packages/working-days` | `@masaar/working-days` | Working-day arithmetic (Iraq Fri/Sat weekend, admin-managed holidays) |
| `packages/scpp-rules` | `@masaar/scpp-rules` | **The rules engine** — every SCPP clause as a pure, tested function |
| `apps/web` | `@masaar/web` | React + Vite app shell — bilingual i18n, approved identity |

## Commands (from repo root)

```bash
npm install        # once
npm test           # vitest — table-driven tests citing SCPP clauses
npm run typecheck  # strict TS across all workspaces
npm run dev        # web app on http://localhost:5173
npm run build      # production build of apps/web
```

## Rules engine — what's covered

| Module | Clauses |
|---|---|
| `methods.ts` | §11 routing of the 8 methods, min invitees, anti-splitting 7.2 |
| `announcement.ts` | 11.1 / 11.2 / 11.4 pre-publish checks (≥21 d, 3 newspapers, invitee minimums) |
| `mct.ts` | 6.9 cycle (14/21 WD deadlines, prevailing estimate), ±20% verdict (6.9.3 / 13.3 / 13.6) |
| `caps.ts` | VO 10% (18.1), extension 25% (19.3), suspension 25% (20.2), LDs 10% (21.2), renewal ≤1 yr (19.1), bonds |
| `bids.ts` | price lock 12.4.2, lowest qualified 6.6, late bids 10.6.1, single bid 15.3, eligibility 10.4, refusal 14.3 |
| `roc.ts` | participation tiers 6.5 / 12.2.2 / 12.2.3 with nomination deadlines |
| `deviation.ts` | actual−planned deviation, compliance %, docs-gate stage closing |

**Golden rule:** any new SCPP clause entering the code ships with a table-driven test naming the clause.

## Conventions

- No hardcoded UI strings — everything via i18next (`apps/web/src/locales/`).
- CSS logical properties only (no physical `left`/`right`).
- Numbers, codes, money, dates: Plex Mono, `direction:ltr`, in both languages.
- Derived values (counts, deltas, cap %, countdowns) are computed, never stored.
