# eClaims — Insurance Claims Portal

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
- [Scope & limitations](#scope--limitations)

---

## Features

**Customer portal**
- Register / log in (JWT-based)
- Submit a claim (policy number, incident date, description, claimed amount)
- Attach supporting documents (PDF / JPEG / PNG, drag-and-drop, ≤ 10 MB, MIME-validated)
- Track claim status on a dashboard and view a full status timeline
- Download uploaded documents

**Internal staff portal**
- Role-aware claims queue with status filters, date-range filters, and sortable columns
- Adjudication actions gated by role and current claim status (assign, survey, adjudicate, approve, reject, pay)
- Document viewer / downloader
- Client-side reports (processing time, amounts paid, status breakdown) for managers

**Platform**
- Six-role RBAC enforced across services
- Claim status **state machine** — invalid transitions are rejected at the API
- Login **rate limiting** and structured **JSON logging** with request-ID correlation
- Redis caching of claim status
- Notification **stub** (logged to stdout + persisted to the `notifications` table)
- Health-checked containers, seeded database, and Nginx with security headers

---

## Architecture

Two React single-page apps sit behind Nginx, which serves static assets and reverse-proxies
API calls to two FastAPI backends. The backends share a PostgreSQL database; the claims
service also uses Redis. The claims service validates every request by calling the auth
service's `/users/me` endpoint.

```
                 ┌───────────────────┐        ┌───────────────────┐
  Browser  ─────▶│  customer-portal  │        │  internal-portal  │
                 │  Nginx :3000      │        │  Nginx :3001      │
                 └─────────┬─────────┘        └─────────┬─────────┘
                           │  /auth  /users  /claims  (reverse proxy)
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

**Backend layering** (both services): `api/routers` → `services` → `repositories` → `models`,
with `dependencies/` providing DB sessions and auth, and `config.py` reading settings from the
environment. Each service is fully async (SQLAlchemy 2.0 async + asyncpg).

---

## Tech stack

| Layer            | Technology                                                             |
|------------------|------------------------------------------------------------------------|
| Backend          | Python 3.12, FastAPI, SQLAlchemy 2.0 (async), Pydantic v2               |
| Auth             | JWT (python-jose), bcrypt (passlib), slowapi rate limiting             |
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
├─ infrastructure/
│  ├─ docker-compose.yml         # orchestrates all 6 containers
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
├─ plans/                        # SAD, estimation, DAR, and POC implementation plans
├─ requirements/                 # original assignment / requirement documents
└─ .env.example                  # root environment template for Docker Compose
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
# 1. Create your environment file and set a JWT secret
cp .env.example .env
# Edit .env and set JWT_SECRET_KEY, e.g.:
#   python -c "import secrets; print(secrets.token_hex(32))"

# 2. Build and start the full stack
cd infrastructure
docker compose up --build --wait
```

Once all six containers report healthy:

| Service          | URL                                  |
|------------------|--------------------------------------|
| Customer portal  | http://localhost:3000                |
| Internal portal  | http://localhost:3001                |
| Auth service API | http://localhost:8001/docs (Swagger) |
| Claims service   | http://localhost:8002/docs (Swagger) |
| PostgreSQL       | localhost:5432                       |
| Redis            | localhost:6379                       |

> The database is seeded automatically from `infrastructure/db/init.sql` on first start
> (6 users, 3 sample claims with status history).

**End-to-end walkthrough:**
1. Open the **customer portal** → log in as `customer@test.com / Test1234!` → submit a claim.
2. Open the **internal portal** → log in as `casemanager@test.com` → assign the claim to a surveyor.
3. Log in as `surveyor@test.com` → start survey → submit assessment.
4. Log in as `adjuster@test.com` → begin adjudication → approve with an amount.
5. Back in the customer portal → the claim now shows **APPROVED**.

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

New self-registrations through the customer portal always receive the `CUSTOMER` role.

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

Nginx in each portal reverse-proxies `/auth`, `/users`, and `/claims` to the backends, so the
SPAs use relative API paths (no CORS). Both portals ship with `X-Frame-Options`,
`X-Content-Type-Options`, `Referrer-Policy`, and a `Content-Security-Policy` header.

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
(CASE_MANAGER may override to any status) APPROVED ──(ADJUSTOR)──▶ PAID   REJECTED
```

- **REJECTED** and **PAID** are terminal states.
- A **CASE_MANAGER** may override a claim to any status (escape hatch).

---

## API reference

Interactive Swagger UI is available at `/docs` on each backend
(`http://localhost:8001/docs`, `http://localhost:8002/docs`).

### Auth service (`:8001`)

| Method | Path             | Auth        | Description                                              |
|--------|------------------|-------------|----------------------------------------------------------|
| POST   | `/auth/register` | Public      | Register a customer account                              |
| POST   | `/auth/login`    | Public      | Log in → access + refresh tokens (rate-limited 10/min)   |
| POST   | `/auth/refresh`  | Refresh JWT | Rotate the token pair                                    |
| GET    | `/users/me`      | Bearer      | Current user profile                                     |
| PATCH  | `/users/me`      | Bearer      | Update own `full_name` / `address`                       |
| GET    | `/users/all`     | Bearer      | List users (CASE_MANAGER, REGIONAL_MANAGER only)         |
| GET    | `/health`        | Public      | Liveness check                                           |

### Claims service (`:8002`)

| Method | Path                                              | Auth   | Description                                       |
|--------|---------------------------------------------------|--------|---------------------------------------------------|
| POST   | `/claims`                                         | Bearer | Submit a claim (CUSTOMER only)                    |
| GET    | `/claims`                                         | Bearer | List claims (customers see only their own)        |
| GET    | `/claims/{id}`                                    | Bearer | Claim detail (ownership-checked for customers)    |
| PATCH  | `/claims/{id}/status`                             | Bearer | Advance claim status (role + state-machine gated) |
| GET    | `/claims/{id}/history`                            | Bearer | Status history timeline                           |
| POST   | `/claims/{id}/documents`                          | Bearer | Upload a document (CUSTOMER, SURVEYOR, ADJUSTOR)  |
| GET    | `/claims/{id}/documents`                          | Bearer | List documents for a claim                        |
| GET    | `/claims/{id}/documents/{doc_id}/download`        | Bearer | Download a document                               |
| GET    | `/health`                                         | Public | Liveness check (reports DB + Redis status)        |

Uploads are validated by extension, size (≤ 10 MB), and true MIME type
(via content sniffing) — mismatches are rejected with `415`, oversize with `413`.

---

## Local development (without Docker)

Each service can be run directly. Point `DATABASE_URL` / `REDIS_URL` at your local instances.

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
echo "VITE_API_BASE_URL=http://localhost:8000" > .env.local   # or your proxy target
npm run dev     # customer-portal → :3000, internal-portal → :3001
```

---

## Running the tests

```bash
# Auth service — 10 tests
cd src/backend/auth-service && pytest -v

# Claims service — 14 tests
cd src/backend/claims-service && pytest -v
```

Tests run against an in-memory SQLite database and a fake Redis, so no external services are
required. There is also an end-to-end smoke test at `infrastructure/smoke-test.sh`.

---

## Configuration

Root `.env` (consumed by Docker Compose) — see `.env.example`:

| Variable            | Description                                            |
|---------------------|--------------------------------------------------------|
| `POSTGRES_USER`     | PostgreSQL username                                    |
| `POSTGRES_PASSWORD` | PostgreSQL password                                    |
| `POSTGRES_DB`       | PostgreSQL database name                               |
| `DATABASE_URL`      | Async SQLAlchemy connection string                     |
| `JWT_SECRET_KEY`    | **Required** — HMAC secret for signing JWTs            |
| `JWT_ALGORITHM`     | JWT algorithm (default `HS256`)                        |
| `AUTH_SERVICE_URL`  | Internal URL claims-service uses to validate tokens    |
| `REDIS_URL`         | Redis connection string                                |

Per-service `.env.example` files add service-specific settings (token lifetimes, upload dir,
max file size, allowed MIME types, cache TTL, log level).

> **Never commit `.env`** — it is gitignored. Always generate a fresh `JWT_SECRET_KEY`.

---

## Scope & limitations

This is a **POC**. The following are intentionally out of scope and deferred to a full
implementation (see `plans/` for the architecture and rationale):

- Payment integration (Stripe) — stubbed endpoint only
- Real SMS / email delivery — notifications are logged and persisted, not sent
- Partner workshop portal, workshop selection & appointment booking
- Auto-assignment of staff by geography / availability
- Rental car booking
- Fraud detection service
- Top Management role (cross-region KPIs)
- Mobile app
- Cloud (AWS) deployment — Docker Compose is for local use only

---

## Documentation

The `plans/` directory contains the supporting engineering documents:

- `01-sad-plan.md` — Software Architecture Document plan
- `01.1-architecture-diagrams-plan.md` — amendment adding the System Context, High Level Solution
  and Logical Architecture diagram pages
- `01.2-cloud-architecture-diagram-plan.md` — amendment adding the Cloud/Deployment and CI/CD
  Pipeline diagram pages
- `02-estimation-plan.md` — effort estimation
- `03-dar-plan.md` — Decision Analysis & Resolution
- `04-poc-plan.md` — the detailed, phase-by-phase POC build plan this code implements

The resulting architecture deliverables live in `docs/sad/`:

- `solution-approach-document.md` — the full Solution Approach Document (SAD)
- `architecture-diagram.drawio.xml` — the seven-page companion diagram set (draw.io / diagrams.net
  source)
