# eClaims — Insurance Claims Portal

[![CI](https://github.com/Utsaverma/insurance-portal/actions/workflows/ci.yml/badge.svg)](https://github.com/Utsaverma/insurance-portal/actions/workflows/ci.yml)

A microservices-based insurance claims management system that demonstrates the end-to-end
claim lifecycle: a customer submits a claim with supporting documents, and internal staff
(case managers, surveyors, adjustors, auditors and managers) process it through a governed
status workflow.

This repository is a **proof of concept (POC)** — a fully runnable local system that exercises
the four core eClaims capabilities via a single `docker compose up`. See
[Scope & limitations](#scope--limitations) for what is and isn't included.

---

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Quick start (Docker Compose)](#quick-start-docker-compose)
- [Seeded test accounts](#seeded-test-accounts)
- [Service reference](#service-reference)
- [Claim status workflow](#claim-status-workflow)
- [API reference](#api-reference)
- [Local development (without Docker)](#local-development-without-docker)
- [Running the tests](#running-the-tests)
- [Configuration](#configuration)
- [Security notes](#security-notes)
- [POC vs target architecture](#poc-vs-target-architecture)
- [Scope & limitations](#scope--limitations)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)

---

## Features

**Customer portal**
- Log in (JWT-based). Accounts come from the seed or from `POST /auth/register`; there is no sign-up page yet
- Submit a claim (policy number, incident date, description, claimed amount in USD)
- Attach a supporting document when submitting (PDF / JPEG / PNG, drag-and-drop, ≤ 10 MB, MIME-validated), and add
  more evidence from the claim page later, until the claim is paid
- Track claims on a dashboard, including the approved amount once a claim is approved
- Follow each claim's status timeline from submission onwards, and download its documents

**Internal staff portal**
- Claims queue, newest first, with a status filter and sorting by incident date
- Actions gated by role, the claim's current status and its assignee, as the server reports them
  (`allowed_actions`): assign or reassign to a surveyor or adjustor, complete the survey with an assessed amount,
  approve with an amount or reject, mark paid
- The assigned surveyor or adjustor uploads a survey report, photos or estimates from the claim page
- Case-manager override: an explicit form with a mandatory reason and a confirmation step
- Claim detail with the claimed, assessed and approved amounts, document downloads, and the audit trail
- Reports for case and regional managers, aggregated in the database across every claim: claims per status,
  approved and paid totals, the average processing time of closed claims (submission to the close recorded in the
  audit trail), open claims by age, and the most recently closed claims

**Platform**
- Role-based access control for six roles (customer + five internal roles), enforced in the API. The workflow
  steps and role permissions are rows in the database, changeable without a redeploy (FR3)
- Claim status **state machine**: invalid transitions are rejected. A case-manager override needs a reason
  and is recorded in the status history. Paid claims are final
- **Amounts** carried through the lifecycle: the surveyor's assessed amount and the adjustor's approved amount,
  which can never exceed the claimed amount (enforced in the service and by database constraints)
- An **audit trail** on every claim, starting at submission: each status change and assignment, who made it
  (their name at the time), when, and the note or override reason
- Login **rate limiting** and structured **JSON logging** with request-ID correlation across services
- Redis cache for the staff directory, so staff views don't call the auth service on every request
- **Notifications through a transactional outbox**: each status change stores an in-app notification and writes
  email and SMS events in the same transaction. A separate dispatcher delivers them at least once, with
  `SKIP LOCKED`, exponential backoff and a dead-letter state. Email goes to a local Mailpit inbox; SMS is logged.
  Staff are emailed when a claim is assigned to them
- Health-checked containers with restart policies, a seeded database, and nginx with security headers

---

## Architecture

Two React single-page apps sit behind Nginx, which serves static assets and reverse-proxies
API calls to two FastAPI backends. The backends share a PostgreSQL database; the claims
service also uses Redis. The claims service validates every request by calling the auth
service's `/users/me` endpoint. Both are deliberate POC simplifications; see
[POC vs target architecture](#poc-vs-target-architecture).

```
                 ┌───────────────────┐        ┌───────────────────┐
  Browser  ─────▶│  customer-portal  │        │  internal-portal  │
                 │  Nginx :3000      │        │  Nginx :3001      │
                 └─────────┬─────────┘        └─────────┬─────────┘
                           │  /api/auth  /api/users  /api/claims  (reverse proxy)
              ┌────────────┴───────────────┬────────────┘
              ▼                             ▼
      ┌───────────────┐            ┌──────────────────┐
      │ auth-service  │◀───────────│  claims-service  │
      │ FastAPI :8001 │  /users/me │  FastAPI :8002   │
      └───────┬───────┘            └───┬──────────┬───┘
              │                        │          │
              ▼                        ▼          ▼
        ┌───────────┐            ┌───────────┐  ┌─────────┐
        │ PostgreSQL│◀───────────│ PostgreSQL│  │  Redis  │
        │   :5432   │            │  (shared) │  │  :6379  │
        └───────────┘            └───────────┘  └─────────┘
```

Notifications leave through a **transactional outbox**. The claims service writes notification events to the
`outbox_events` table in the same transaction as the claim change. The `notification-dispatcher` worker (same
image, `python -m workers.outbox_dispatcher`) delivers them: email over SMTP to Mailpit, SMS to the log.

**Backend layering** (claims-service; auth-service uses the same folders):
- `api/routers`: HTTP only. Parse the request, delegate to a service, shape the response.
- `services`: business rules (access checks, the state machine, amounts, assignment). Failures are raised as
  business errors (`services/errors.py`) and mapped to HTTP status codes in one place in `main.py`.
- `repositories`: data access.
- `models`: ORM models and API schemas.

`dependencies/` provides DB sessions and authentication, and `config.py` reads settings from the environment.
Each service is fully async (SQLAlchemy 2.0 async + asyncpg).

---

## Tech stack

| Layer            | Technology                                                             |
|------------------|------------------------------------------------------------------------|
| Backend          | Python 3.12, FastAPI, SQLAlchemy 2.0 (async), Pydantic v2               |
| Auth             | JWT (python-jose), bcrypt, slowapi rate limiting on login              |
| Frontend         | React 18, TypeScript, Vite, React Router 6, Axios, Tailwind CSS        |
| Data             | PostgreSQL 15, Redis 7                                                  |
| File validation  | python-magic (MIME sniffing), aiofiles                                  |
| Logging          | structlog (JSON, request-ID correlation)                               |
| Infrastructure   | Docker, Docker Compose, Nginx                                          |
| Testing          | pytest, pytest-asyncio, httpx, aiosqlite / fakeredis                   |

---

## Repository layout

```
insurance-portal/
├─ .github/workflows/ci.yml      # CI: pytest, portal builds, shared-file and compose checks
├─ infrastructure/
│  ├─ .env.example               # environment template; copy to infrastructure/.env
│  ├─ docker-compose.yml         # orchestrates all 8 containers
│  ├─ db/init.sql                # schema + seed data (users, claims, history)
│  ├─ nginx/                     # per-portal Nginx configs (proxy + security headers)
│  └─ smoke-test.sh              # end-to-end smoke test
├─ src/
│  ├─ backend/
│  │  ├─ auth-service/           # JWT auth, users, RBAC, rate limiting
│  │  └─ claims-service/         # claim lifecycle, documents, state machine, cache
│  └─ frontend/
│     ├─ customer-portal/        # React SPA for customers
│     └─ internal-portal/        # React SPA for internal staff
├─ docs/
│  ├─ dar/                       # Decision/architecture rationale docs
│  ├─ estimation/                # Estimation spreadsheet
│  └─ sad/                       # Solution Approach Document + diagrams
└─ requirements/                 # original assignment / requirement documents
```

---

## Prerequisites

- **Docker** and **Docker Compose** (v2) — the only requirement for the quick start.
- For local development without Docker: **Python 3.12+**, **Node.js 20+**, and running
  **PostgreSQL 15** + **Redis 7** instances.

---

## Quick start (Docker Compose)

From the repository root:

```bash
# 1. Create the environment file where Docker Compose reads it (infrastructure/.env),
#    then set JWT_SECRET_KEY to at least 32 characters
cp infrastructure/.env.example infrastructure/.env
python3 -c "import secrets; print(secrets.token_hex(32))"   # paste the output into JWT_SECRET_KEY

# 2. Build and start the full stack
cd infrastructure
docker compose up --build --wait
```

> Port already in use? Set `CUSTOMER_PORTAL_PORT`, `INTERNAL_PORTAL_PORT`, `AUTH_PORT`, `CLAIMS_PORT`,
> `POSTGRES_PORT`, `REDIS_PORT` or `MAIL_UI_PORT` in `infrastructure/.env` (defaults 3000, 3001, 8001, 8002, 5432,
> 6379, 8025).

Once the containers report healthy:

| Service          | URL                                  |
|------------------|--------------------------------------|
| Customer portal  | http://localhost:3000                |
| Internal portal  | http://localhost:3001                |
| Auth service API | http://localhost:8001/docs (Swagger) |
| Claims service   | http://localhost:8002/docs (Swagger) |
| PostgreSQL       | localhost:5432                       |
| Redis            | localhost:6379                       |
| Mail (Mailpit)   | http://localhost:8025 (every notification email lands here) |

> The database is seeded automatically from `infrastructure/db/init.sql` on first start: 6 users and 6 sample
> auto claims, one per key status, each with a legal status history. `init.sql` runs only on an empty database,
> so reset with `docker compose down -v` after changing it. To keep your data instead, re-apply it: it only adds
> what is missing (`docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < db/init.sql`).

**End-to-end walkthrough** (the demo path; `infrastructure/smoke-test.sh` automates the same journey through the API):
1. **Customer portal**: log in as `customer@test.com` / `Test1234!` and submit a claim with a photo or police report
   (PDF, JPEG or PNG, up to 10 MB).
2. **Internal portal**: log in as `casemanager@test.com` and assign the claim to Carol Surveyor.
3. Log in as `surveyor@test.com`, start the survey, upload a survey report from the claim page, and complete the
   survey with an assessed amount.
4. Log in as `adjuster@test.com`, begin adjudication and approve an amount (never above the claimed amount).
5. Back in the **customer portal**: the claim shows **APPROVED** with the approved amount and its full timeline.
6. Log in as `auditor@test.com` and open any claim to see its audit trail.
7. Log in as `casemanager@test.com` and reopen the seeded **REJECTED** claim with an override (a reason is required).
8. Open Mailpit at http://localhost:8025: the customer was emailed at every status change, and the surveyor when
   the claim was assigned. To see at-least-once delivery, run `docker compose stop notification-dispatcher`,
   change a status, then `docker compose start notification-dispatcher`. The email still arrives.

Tear down with `docker compose down` (add `-v` to also drop the database and upload volumes).

---

## Seeded test accounts

All seeded users share the password **`Test1234!`**.

| Email                   | Role               | Name           |
|-------------------------|--------------------|----------------|
| customer@test.com       | `CUSTOMER`         | Alice Customer |
| adjuster@test.com       | `ADJUSTOR`         | Bob Adjuster   |
| surveyor@test.com       | `SURVEYOR`         | Carol Surveyor |
| casemanager@test.com    | `CASE_MANAGER`     | David Case     |
| auditor@test.com        | `AUDITOR`          | Eve Auditor    |
| manager@test.com        | `REGIONAL_MANAGER` | Frank Manager  |

Self-registration (`POST /auth/register`) always gives the `CUSTOMER` role. It is API-only; the portal has no
sign-up page yet. Emails are case-insensitive: they are stored and matched in lower case.

Each portal signs in only its own accounts: the customer portal accepts customers, the internal portal accepts
staff. The other kind of account is told which portal to use.

---

## Service reference

| Service          | Container port | Host port | Depends on                          |
|------------------|----------------|-----------|-------------------------------------|
| auth-service     | 8000           | **8001**  | postgres                            |
| claims-service   | 8000           | **8002**  | postgres, redis, auth-service       |
| customer-portal  | 80             | **3000**  | auth-service, claims-service        |
| internal-portal  | 80             | **3001**  | auth-service, claims-service        |
| postgres         | 5432           | 5432      | —                                   |
| redis            | 6379           | 6379      | —                                   |
| notification-dispatcher | —       | —         | postgres, mail (claims-service image, `python -m workers.outbox_dispatcher`) |
| mail (Mailpit)   | 1025 (SMTP), 8025 (UI) | **8025** | —                                |

Nginx in each portal serves the SPA and reverse-proxies `/api/auth`, `/api/users` and `/api/claims`
to the backends, stripping the `/api` prefix. The SPAs therefore call a same-origin API (no CORS), and
API routes can never collide with SPA routes such as `/claims/:id`. Uploads of up to 12 MB pass through
nginx; the API itself enforces the 10 MB limit. Both portals ship with `X-Frame-Options`,
`X-Content-Type-Options`, `Referrer-Policy`, and a `Content-Security-Policy` header.
The SPA shell (`index.html`) is served with `Cache-Control: no-cache`, so a rebuilt portal is picked up on the
next page load; the hashed assets it points to are cached as immutable.

---

## Claim status workflow

Claims progress through a governed state machine. Each transition is allowed only for a
specific role and only from the correct current status; the claims service rejects anything
else with `400 Invalid state transition`.

```
SUBMITTED ──(CASE_MANAGER)──▶ ASSIGNED ──(SURVEYOR)──▶ UNDER_SURVEY
   │                                                        │
   │                                                   (SURVEYOR)
   │                                                        ▼
   │                                                    SURVEYED
   │                                                        │
   │                                                   (ADJUSTOR)
   │                                                        ▼
   │                                             UNDER_ADJUDICATION
   │                                              (ADJUSTOR) │
   │                                        ┌───────────────┴──────────────┐
   ▼                                        ▼                              ▼
(CASE_MANAGER may override, with a reason) APPROVED ──(ADJUSTOR)──▶ PAID   REJECTED
```

- **PAID** is final: no role, including a case manager, can change it. A claim can be paid only once it has an
  approved amount, so no override can skip approval.
- **REJECTED** ends the normal flow, but a case manager can reopen it with an override. Rejecting a claim
  needs a reason (`note`), which the customer sees on the claim's timeline.
- The steps above and who may assign, override, upload, submit and read reports are **configurable without a code
  change** (FR3). They live in the `workflow_transitions` and `role_permissions` tables, which are seeded from the
  same rules as the code. The claims service reads them through a 30-second cache, so a row changed in psql takes
  effect within 30 seconds, and the portals follow it because the server computes `allowed_actions`.
  `GET /health` shows the source (`workflow_policy`: `db`, `code` or `code-fallback`). For example, to stop
  adjustors rejecting claims:
  `DELETE FROM workflow_transitions WHERE from_status = 'UNDER_ADJUDICATION' AND role = 'ADJUSTOR' AND to_status = 'REJECTED';`
  One gap: the internal portal shows the Reports page to the default roles (case and regional managers) whatever
  `reports.view` says; the API itself follows the table.
- A **CASE_MANAGER** may override a claim to any other status, with a mandatory reason. The override is
  recorded in the status history as `Case manager override: <reason>`. A change to the status the claim
  already has is refused, so an override cannot quietly rewrite an approved amount.
- Completing the survey (**SURVEYED**) requires an assessed amount. Approving (**APPROVED**) requires an approved
  amount no higher than the claimed amount. The same rules apply to overrides.
- Assigning a **SUBMITTED** claim moves it to **ASSIGNED**; later reassignments keep the status. Every assignment
  is recorded in the history, and closed claims (**PAID** or **REJECTED**) cannot be reassigned. A claim is
  assigned only to a **SURVEYOR** or an **ADJUSTOR**.
- Surveyors and adjustors act only on claims **assigned to them**; anyone else gets `403`. They can still read
  every claim. Completing the survey leaves the claim unassigned in the adjudication queue. The adjustor who
  begins adjudication becomes its assignee, unless a case manager has already assigned a specific adjustor.
  Document uploads by surveyors and adjustors follow the same rule.

---

## API reference

Interactive Swagger UI is available at `/docs` on each backend
(`http://localhost:8001/docs`, `http://localhost:8002/docs`). Through the portals, the same routes are served
under `/api` (for example `http://localhost:3000/api/claims`).

### Auth service (`:8001`)

| Method | Path             | Auth        | Description                                              |
|--------|------------------|-------------|----------------------------------------------------------|
| POST   | `/auth/register` | Public      | Register a customer account (`409` if the email is taken, in any letter case) |
| POST   | `/auth/login`    | Public      | Log in → access + refresh tokens (rate-limited 10/min; deactivated accounts are refused) |
| POST   | `/auth/refresh`  | Refresh JWT | Issue a new token pair (the old refresh token stays valid until it expires) |
| GET    | `/users/me`      | Bearer      | Current user profile                                     |
| PATCH  | `/users/me`      | Bearer      | Update own `full_name` (cannot be blank)                 |
| GET    | `/users/all`     | Bearer      | List users (CASE_MANAGER, REGIONAL_MANAGER, SURVEYOR, ADJUSTOR) |
| GET    | `/health`        | Public      | Liveness check                                           |

### Claims service (`:8002`)

| Method | Path                                              | Auth   | Description                                       |
|--------|---------------------------------------------------|--------|---------------------------------------------------|
| POST   | `/claims`                                         | Bearer | Submit a claim (CUSTOMER only); policy number 1–50 characters, description at least 20, incident date not in the future |
| GET    | `/claims`                                         | Bearer | List claims, newest first (customers see only their own; `limit` 1–1000) |
| GET    | `/claims/{id}`                                    | Bearer | Claim detail (ownership-checked for customers)    |
| POST   | `/claims/{id}/assign`                             | Bearer | Assign to a surveyor or adjustor (CASE_MANAGER, REGIONAL_MANAGER); a SUBMITTED claim becomes ASSIGNED; closed claims cannot be reassigned |
| PATCH  | `/claims/{id}/status`                             | Bearer | Change status: role + state-machine gated; `assessed_amount` at SURVEYED, `approved_amount` at APPROVED; PAID only with an approved amount; overrides and rejections need a `note` |
| GET    | `/claims/{id}/history`                            | Bearer | Audit trail from SUBMITTED: status changes and assignments, each with who acted (`changed_by_name`) |
| GET    | `/reports/summary`                                | Bearer | Claims report aggregated in SQL (CASE_MANAGER, REGIONAL_MANAGER); served under `/api` by the internal portal only |
| POST   | `/claims/{id}/documents`                          | Bearer | Upload a document (CUSTOMER on their own claim; SURVEYOR, ADJUSTOR on a claim assigned to them); not once the claim is PAID |
| GET    | `/claims/{id}/documents`                          | Bearer | List documents for a claim                        |
| GET    | `/claims/{id}/documents/{doc_id}/download`        | Bearer | Download a document                               |
| GET    | `/health`                                         | Public | Liveness check (reports DB + Redis status)        |

Every claim the service returns carries `allowed_actions`, which lists what the caller may do to it right now:
- `transitions`: workflow steps;
- `overrides`: case-manager override targets;
- `assign`: whether the caller may assign or reassign the claim;
- `upload`: whether the caller may upload documents.

The server works these out from the same rules it enforces, and the internal portal's action panel renders
only what they list, so the portal has no copy of the state machine.

Uploads are validated by extension, size (≤ 10 MB) and true content type (content sniffing): a file whose
content is not an allowed type, or does not match its own extension, is rejected with `415`, oversize with
`413`. A document is listed under its base file name; any directory part the client sent is dropped.

Status codes are the same on every route: `401` without a valid token, `403` for a role or a claim the caller
may not touch, `404` for an unknown claim or document, `400` with a `detail` message for a business-rule
violation, and `422` for invalid input. Money is positive with at most 2 decimal places and 10 whole digits
(the database's `NUMERIC(12,2)`); anything else is refused with `422` rather than rounded.

---

## Local development (without Docker)

Each service can be run directly with Python 3.12. Point `DATABASE_URL` / `REDIS_URL` at your local instances,
and apply `infrastructure/db/init.sql` to the database first (the services don't create tables).

### Auth service

```bash
cd src/backend/auth-service
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env    # then edit values
uvicorn main:app --reload --port 8001
```

### Claims service

```bash
cd src/backend/claims-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt   # requires libmagic on the host for python-magic
cp .env.example .env
uvicorn main:app --reload --port 8002
```

### Frontends

```bash
cd src/frontend/customer-portal   # or internal-portal
npm install
npm run dev     # customer-portal → :3000, internal-portal → :3001; /api is proxied to the services on :8001 / :8002
```

#### Shared design tokens

The design tokens and the pre-paint theme bootstrap are **duplicated byte-for-byte** in both
portals rather than imported from a shared path. This is deliberate: `docker-compose.yml` sets each
portal directory as its own build `context:`, so a file above the context is not copied into the
image — a shared import would build fine on the host and fail inside the image. (`ClaimStatusBadge.tsx`
is already duplicated this way, so this is the established convention here.)

After touching any shared file, run the drift check — it must exit 0:

```bash
bash src/frontend/check-shared.sh
```

It walks the full shared set (design tokens, `ui/*` primitives, `layout/{AppShell,Header,MobileNav,ThemeToggle,UserMenu}.tsx`, `ThemeContext.tsx`, `lib/{cn,initials,theme,format}.ts`, `DocumentList.tsx`, `StatusTimeline.tsx`) and fails loudly on any unexpected difference, with an explicit allowlist for the files that legitimately differ per portal (`nav.ts`, `layout/shell.ts`, `pages/Login.tsx`, `index.html`, `main.tsx`, `ui/index.ts`, `ClaimStatusBadge.tsx`, `lib/user.ts`).

Two rules that are easy to break and only fail in the production build:

- **Never interpolate a Tailwind class name.** The content scanner is a regex over source text, so
  ``className={`bg-status-${key}-soft`}`` emits no CSS at all. Every variant class must appear as a
  complete literal string in a static map.
- **Colour tokens are space-separated RGB channels, not hex.** `bg-surface/85` + `backdrop-blur` on
  the sticky header depends on it; a hex value silently breaks every opacity modifier.

---

## Running the tests

```bash
# Run inside the service images (Python 3.12 + libmagic, exactly as in production).
# After changing code, rebuild first: docker compose build auth-service claims-service
cd infrastructure
docker compose run --rm --no-deps auth-service python -m pytest -q     # 19 tests
docker compose run --rm --no-deps claims-service python -m pytest -q   # 64 tests (the init.sql seed check is skipped in the image; CI runs it)
```

Tests use an in-memory SQLite database, a fake Redis and a stubbed auth-service call, so no other
containers need to be running.

**Pre-demo gate:** `cd infrastructure && bash smoke-test.sh` runs the whole demo journey through nginx `/api`:
- security headers and deep links;
- uploads;
- every workflow rule, including its rejection path;
- cross-customer access;
- health.

It stops with a non-zero exit code at the first unexpected result. It makes 6 logins, and login is rate-limited
to 10 per minute, so don't run it in the minute before a live demo.

**CI:** [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push and on pull requests to `main`:
- both pytest suites on Python 3.12 with libmagic, matching the service images;
- `npm ci && npm run build` (type-check plus Vite build) for both portals;
- `src/frontend/check-shared.sh`;
- `docker compose config -q` against `.env.example`.

The smoke test needs the running stack, so it is not part of CI.

---

## Configuration

`infrastructure/.env` (the only file Docker Compose reads) — see `infrastructure/.env.example`:

| Variable            | Description                                            |
|---------------------|--------------------------------------------------------|
| `POSTGRES_USER`     | PostgreSQL username                                    |
| `POSTGRES_PASSWORD` | PostgreSQL password                                    |
| `POSTGRES_DB`       | PostgreSQL database name                               |
| `DATABASE_URL`      | Async SQLAlchemy connection string                     |
| `JWT_SECRET_KEY`    | **Required** — HMAC secret for signing JWTs (≥ 32 characters; the auth service refuses to start otherwise) |
| `JWT_ALGORITHM`     | JWT algorithm (default `HS256`)                        |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access-token lifetime (POC default 120, long enough for a full demo) |
| `AUTH_SERVICE_URL`  | Internal URL claims-service uses to validate tokens (default `http://auth-service:8000`) |
| `REDIS_URL`         | Redis connection string                                |
| `WORKFLOW_SOURCE`   | `db` (default): the workflow and role permissions come from the `workflow_transitions` and `role_permissions` tables, cached for 30 s, with the rules in code as the fallback while the tables are empty or missing. `code`: the rules in code only |
| `CUSTOMER_PORTAL_PORT` · `INTERNAL_PORTAL_PORT` · `AUTH_PORT` · `CLAIMS_PORT` | Host ports (defaults 3000 · 3001 · 8001 · 8002) |

Per-service `.env.example` files add service-specific settings (token lifetimes, upload dir,
max file size, allowed MIME types, cache TTL, log level).

> **Never commit `.env`** — it is gitignored. Always generate a fresh `JWT_SECRET_KEY`.

---

## Security notes

What the POC implements:
- JWT access and refresh tokens, signed with HS256 using a secret of at least 32 characters, with the algorithm
  pinned on decode; passwords hashed with bcrypt
- Login rate-limited to 10 attempts per minute per client
- Role checks on every endpoint, plus ownership checks, so customers only reach their own claims and documents,
  and surveyors and adjustors change only the claims assigned to them
- Uploads checked by extension, size and sniffed content type, and stored under random names (no path traversal)
- Parameterised queries throughout (SQLAlchemy); no SQL is built from user input
- nginx security headers on the portals: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` and a
  `Content-Security-Policy`
- Secrets come from `infrastructure/.env`, which is gitignored and never copied into images (`.dockerignore`)

Known gaps, on the roadmap for a production build:
- Tokens are kept in `localStorage`; refresh tokens are not revoked, and there is no reuse detection
- Security headers are not repeated on static assets, and there is no TLS locally
- PostgreSQL and Redis ports are published to the host, and Redis has no password
- Containers run as root; `python-jose` should be replaced (CVE-2024-33663, CVE-2024-33664)
- Staff can read every claim; there is no regional scoping yet

---

## POC vs target architecture

The POC is a *minimal working* slice of the architecture in `docs/sad/solution-approach-document.md`
(SAD §8, *POC coverage*). This is what stands in for each target component, and why:

| Target (SAD) | In this POC | Why it differs |
|---|---|---|
| CloudFront, WAF, ALB | nginx per portal: `/api` routing, security headers, 12 MB body limit | Local, single host |
| Auth Service with Okta SSO; tokens validated locally | `auth-service`: HS256 JWT access and refresh tokens. claims-service validates every request by calling `/users/me` | Simple, and role changes take effect immediately; the cost is one extra hop per request |
| Claims Service + Workflow Engine (Step Functions) | In-service, role-gated state machine in `services/claims_service.py` | The baseline option in the Orchestration DAR. The rules live in one module, so moving to an engine changes orchestration, not business logic |
| User/RBAC + Configuration Service | Workflow steps and role permissions in two claims-service tables, read through a 30 s Redis cache; no admin UI yet (edited with SQL) | The rules are configurable now; a configuration service and an admin UI only change where they are edited |
| Event bus + Notification Service (SNS, SES) | Transactional outbox in PostgreSQL + `notification-dispatcher` worker; email to Mailpit over SMTP, SMS logged | Same delivery guarantees (at-least-once, retries, dead letters) without cloud providers; in the target the dispatcher publishes to the bus instead |
| Document Service (S3 + OpenSearch) | Validated uploads on a local volume | Local, single host |
| Separate Claims and User databases (RDS PostgreSQL) | One PostgreSQL instance shared by both services | Fewer moving parts |
| ElastiCache Redis | Redis caching the staff directory | — |
| Reporting Service + Redshift | `GET /reports/summary` in claims-service, aggregated in SQL on the operational database | Small data volumes; the queries move to a read model or warehouse unchanged in shape |
| CloudWatch + X-Ray | JSON logs with request-ID correlation across services | — |
| ECS Fargate, CodePipeline, Terraform | Docker Compose | Local, single host |

---

## Scope & limitations

This is a **POC**. The following are intentionally out of scope and deferred to a full
implementation (see `docs/sad/` for the architecture and rationale):

- Payment integration (Stripe): not implemented; PAID is a status the adjustor sets
- Real SMS delivery and a production mail provider: email goes to the local Mailpit inbox, SMS is only logged
- Partner workshop portal, workshop selection and appointment booking
- Auto-assignment of staff by geography / availability
- Rental car booking
- Fraud detection
- Top Management role (cross-region KPIs)
- Customer sign-up page, profile (address, billing cycle) and payment screens
- Token refresh in the portals: a session lasts the access-token lifetime (120 minutes by default)
- Configurable permissions: role rules are fixed in code in the POC
- Mobile app
- Cloud (AWS) deployment: Docker Compose is for local use only

---

## Troubleshooting

- **A port is already in use:** set `CUSTOMER_PORTAL_PORT`, `INTERNAL_PORTAL_PORT`, `AUTH_PORT`, `CLAIMS_PORT`, `POSTGRES_PORT` or `REDIS_PORT`
  in `infrastructure/.env`.
- **Schema or seed changes don't show up:** `init.sql` runs only on an empty database. Reset with
  `docker compose down -v && docker compose up -d --wait`.
- **Login returns 429:** login is limited to 10 attempts per minute per client; wait a minute.
- **The claims API returns 503:** the auth service is unreachable. Check `docker compose ps` and
  `docker compose logs auth-service`.

---

## Documentation

Decision records and the estimate:

- `docs/dar/`: Decision Analysis and Recommendation documents for the workflow engine, backend framework,
  compute platform and container orchestrator
- `docs/estimation/`: the effort estimate, schedule and resource plan

The architecture deliverables live in `docs/sad/`:

- `solution-approach-document.md` — the full Solution Approach Document (SAD)
- `architecture-diagram.drawio.xml` — the seven-page companion diagram set (draw.io / diagrams.net
  source)
- `diagrams/` — exported JPEG renders of each diagram page (Bounded Contexts, System Context,
  High Level Solution, Logical Architecture, Layered Solution Architecture, Cloud/Deployment
  Architecture, CI/CD Pipeline)
