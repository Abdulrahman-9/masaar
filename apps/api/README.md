# @masaar/api — NestJS backend

The server tier. It applies the validated Prisma schema and enforces every SCPP
guard that the frontend store prototyped — now **binding**, not bypassable from DevTools.

## Run locally (needs Docker Desktop running)

From the repo root:

```bash
cp .env.example .env          # once
npm run db:up                 # start PostgreSQL 16 (docker compose)
npm run db:generate           # generate Prisma client
npm run db:migrate            # create tables (prisma migrate dev)
npm run db:seed               # demo data mirroring the frontend seed
npm run dev:api               # API on http://localhost:4000/api
```

Health check: `GET http://localhost:4000/api/health`.

## Security posture (the gaps the earlier review flagged, now closed server-side)

| Concern | How it's handled |
|---|---|
| Session theft via XSS | JWT in an **httpOnly** cookie (not localStorage) |
| CSRF | `sameSite=lax` session cookie |
| Transport | `secure` cookie + HSTS via Helmet in production |
| Response headers | **Helmet** (CSP, X-Content-Type-Options, …) |
| Role enforcement | Global `JwtAuthGuard` + `RolesGuard`; `@Roles(...)` per endpoint |
| Company isolation | Operator roles scoped to their own `operatorId` in the service, not the UI |
| Input validation | Global `ValidationPipe` (whitelist + forbid unknown + transform) on typed DTOs |
| Tamper-evident trail | Append-only `AuditLog`; refused attempts are recorded too (8.1-e) |

## The guards (mirror the frontend store, now authoritative)

Each is covered by a unit test in `test/tenders.service.spec.ts` that runs **without a
database** (mocked Prisma) using the real `@masaar/scpp-rules` engine:

| Endpoint | Refuses when… | Clause |
|---|---|---|
| `POST /tenders` | override without justification | §11 + override rule |
| `POST /tenders/:id/publish` | pre-publish checks fail | 11.1 / 11.2 / 11.4 |
| `POST /tenders/:id/price` | bidder not technically qualified / not a commercial step | 12.4.2 |
| `POST /tenders/:id/complete-stage` | required documents missing | docs gate |
| `POST /tenders/:id/ratify` `…/return` | not at the ratification stage / no notes / already decided | governance |
| any `:id` route | operator reaches another company's tender | scope (10.x) |

## Swapping the mock auth for Azure AD

`AUTH_MODE=mock` issues local JWTs for the demo. Production sets `AUTH_MODE=azure` and
replaces only how `AuthUser` is obtained (MSAL token validation); the cookie + guard
contract above is unchanged.

## Build note

`npm run dev:api` (tsx) is the local run path and resolves the `@masaar/*` workspace
packages from source. A production container build bundles the app (e.g. esbuild/`nest build`)
— tracked with the other deployment tasks in `../../DELIVERY.md`.
