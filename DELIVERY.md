# Masaar (مسار) — Delivery Note

Bilingual (Arabic-RTL default / English-LTR) contractor & tender management platform
digitizing **SCPP Rev 1.0** for petroleum-sector procurement. This note is the handoff
summary; the phased plan with acceptance criteria lives in
`../_handoff_masaar_website/BUILD_PLAN.md`.

## What is delivered (runs locally today)

| Area | Status |
|---|---|
| **Rules engine** `@masaar/scpp-rules` | ✅ Every SCPP clause as a pure, tested function — §11 routing, announcement checks, MCT 6.9 cycle, ±20% verdict, §18–21 caps, eligibility, deviation |
| **Working-day calendar** `@masaar/working-days` | ✅ Iraq Fri/Sat weekend + admin-managed holidays |
| **Design tokens** `@masaar/tokens` | ✅ CSS (source of truth) + TS mirror, self-hosted Plex fonts |
| **Component library** `@masaar/ui` | ✅ 7 components × 3 skins (Living Ledger / Operations Room / Engineering Blueprint) |
| **Operator portal** | ✅ Dashboard, new request (auto-routing + split-risk 7.2), stage scheduling, announcement (pre-publish checks), bid entry (price lock 12.4.2), complete stage (docs gate) |
| **Admin dashboard** | ✅ Overview, MCT (dark skin), contracts (caps), compliance, vendors, reports (CSV/print), paths guide, roles matrix, audit log, **tender review (ratify / return-with-notes)** |
| **Auth** | ✅ Mock Azure AD + 2FA two-step login → role-scoped session, route guard |
| **i18n** | ✅ Full AR/EN, instant switch, no hardcoded UI strings |
| **Data model** | ✅ Validated Prisma schema (`packages/db/schema.prisma`) mirroring the client store 1:1 |
| **Tests** | ✅ 122 passing (engine table-tests citing clauses + DOM tests + store breach-attempt tests) |
| **CI** | ✅ GitHub Actions — typecheck + test + build on every push |

The client store (`apps/web/src/store.tsx`) enforces the SCPP guards itself (publish blocked
until checks pass, price locked off-step, stage close blocked without docs, ratify only at the
ratify stage). These guards are written **as the future API contract** — they move server-side
unchanged.

## Run

```bash
nvm use            # Node 24
npm install
npm test           # 122 tests
npm run typecheck
npm run dev        # http://localhost:5173
npm run build      # static bundle in apps/web/dist
```

Login with **any 6-digit code**. Explore: Operator portal, Admin dashboard, Component library.
Language toggle is top-right.

## Deploy

The app is a hash-routed static SPA — `npm run build` produces `apps/web/dist/`, deployable to
any static host (Azure Static Web Apps, Nginx, S3+CloudFront) with **no server rewrites required**.
Deploy at a domain root (assets are referenced from `/assets/`).

## Remaining — needs the enterprise environment (cannot be done locally)

1. **PostgreSQL + API server** — apply `schema.prisma`, lift the store guards into API endpoints,
   enforce the 6-role matrix per endpoint.
2. **Azure AD (MSAL)** against the corporate tenant — replaces the mock login.
3. **Email notifications** — the in-app notice computation already exists (`notify.ts`); wire it to
   a mailer for the 3-WD / 1-day deadline reminders.
4. **Document upload** — real file storage behind the docs gate (currently checkbox simulation).
5. **Pre-launch passes** — WCAG AA audit with an Arabic screen reader, TTI measurement, virtualized
   tables for 1000+ rows, security review of the API, UAT with two pilot operators.

## Repository layout

```
masaar/
├─ packages/
│  ├─ tokens/         @masaar/tokens   — design tokens (CSS + TS)
│  ├─ working-days/   @masaar/working-days
│  ├─ scpp-rules/     @masaar/scpp-rules — the rules engine
│  ├─ ui/             @masaar/ui       — component library (3 skins)
│  └─ db/             schema.prisma    — validated data model
├─ apps/
│  └─ web/            @masaar/web      — React + Vite app (both portals)
└─ .github/workflows/ci.yml
```
