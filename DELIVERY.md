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
| **Auth (web)** | ✅ Mock Azure AD + 2FA two-step login → role-scoped session, route guard |
| **i18n** | ✅ Full AR/EN, instant switch, no hardcoded UI strings |
| **Data model** | ✅ Validated Prisma schema (`packages/db/schema.prisma`) + `@masaar/db` client & seed |
| **Backend API** `@masaar/api` | ✅ NestJS: httpOnly-cookie JWT auth, Helmet, CORS, validation, RolesGuard + company-scope, **the SCPP guards enforced server-side**, append-only audit |
| **Tests** | ✅ 133 passing (engine + DOM + frontend store + **server-side guard** tests) |
| **CI** | ✅ GitHub Actions — Prisma generate + typecheck + test + build on every push |

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

## Backend — run it locally

The API exists (`apps/api`, NestJS). It needs **Docker Desktop running**, then from the root:

```bash
cp .env.example .env
npm run db:up && npm run db:generate && npm run db:migrate && npm run db:seed
npm run dev:api        # http://localhost:4000/api  (health: /api/health)
```

The SCPP guards are now enforced **server-side** (publish/price/stage-close/ratify/scope), proven by
`apps/api/test/tenders.service.spec.ts` which runs without a database. See `apps/api/README.md`.

## Remaining — needs the enterprise environment

1. **Azure AD (MSAL)** against the corporate tenant — replaces `AUTH_MODE=mock`; only the token→AuthUser
   step changes, the cookie/guard contract stays.
2. **Wire the web app to the API** — replace the client `store.tsx` localStorage with calls to the
   endpoints (the store guards already match the API contract 1:1).
3. **Email notifications** — `notify.ts` already computes the notices; wire to a mailer for the
   3-WD / 1-day reminders.
4. **Document upload** — real file storage behind the docs gate (currently checkbox simulation).
5. **Production container build** — bundle the Nest app (esbuild/`nest build`) + deploy Postgres.
6. **Pre-launch passes** — WCAG AA with an Arabic screen reader, TTI measurement, virtualized tables
   for 1000+ rows, full security review, UAT with two pilot operators.

## Repository layout

```
masaar/
├─ packages/
│  ├─ tokens/         @masaar/tokens   — design tokens (CSS + TS)
│  ├─ working-days/   @masaar/working-days
│  ├─ scpp-rules/     @masaar/scpp-rules — the rules engine
│  ├─ ui/             @masaar/ui       — component library (3 skins)
│  └─ db/             @masaar/db       — Prisma schema, client & seed
├─ apps/
│  ├─ web/            @masaar/web      — React + Vite app (both portals)
│  └─ api/            @masaar/api      — NestJS backend (auth, guards, audit)
├─ docker-compose.yml                  — PostgreSQL 16
└─ .github/workflows/ci.yml
```
