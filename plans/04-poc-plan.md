# Plan 4 — Minimal Working POC

## Deliverable
A fully runnable local system demonstrating the 4 key eClaims capabilities via `docker compose up`.

**Stack:** Python FastAPI + React 18 (TypeScript) + PostgreSQL 15 + Redis 7 + Docker Compose

## Scope
**In scope:**
- `auth-service` — JWT auth, RBAC (6 roles), rate limiting, structured logging
- `claims-service` — claim lifecycle, document upload (MIME-validated), status state machine, Redis cache, notification stub
- `customer-portal` — React app (login, submit claim, track status, download documents)
- `internal-portal` — React app (claims queue with filters, role-aware adjudication, reports)
- `infrastructure/` — Docker Compose with healthchecks, DB seed, Nginx configs with security headers

**Out of scope (deferred to full implementation):**
- Payment integration (Stripe — stubbed endpoint only)
- Real SMS/Email (notifications logged to stdout + DB)
- Partner workshop portal (architecture included in SAD; not coded in POC)
- Mobile app
- AWS deployment (Docker Compose for local only)
- Workshop selection & appointment booking (Customer Portal flow)
- Auto-assignment of staff by geography/availability (Incident Management Service)
- Rental car booking
- Fraud detection service (not even a stub in POC)
- Top Management role (cross-region KPIs — deferred to full implementation)

---

## Implementation Phases — Multi-Agent Overview

| Phase | Mode | Agents | Work |
|---|---|---|---|
| **Phase 1** | Parallel | 2 | Agent A: auth-service · Agent B: Infrastructure Foundation |
| **Phase 2** | Sequential | 1 | claims-service |
| **Phase 3** | Parallel | 2 | Agent A: customer-portal · Agent B: internal-portal |
| **Phase 4** | Sequential | 1 | Docker Compose wiring + full smoke test |

**Dependency rationale:**
- `auth-service` has no inter-service dependencies → starts immediately
- Infrastructure Foundation (DB schema, `.env`) has no code dependencies → runs in parallel with auth-service
- `claims-service` calls auth-service's `/users/me` → must start after Phase 1
- Both portals depend only on API contracts → build in parallel after Phase 2
- Docker Compose final wiring and smoke tests need all images built → Phase 4 last

---

## Phase 1 — Parallel (2 Agents)

### Agent A: auth-service

**Step 1 — Create directory tree and `requirements.txt`**

- From the repo root, create the full directory skeleton:

```shell
mkdir -p src/backend/auth-service/{api/routers,services,models,repositories,dependencies,tests}
touch src/backend/auth-service/{main.py,config.py,.env.example,Dockerfile}
touch src/backend/auth-service/api/__init__.py
touch src/backend/auth-service/api/routers/{__init__.py,auth.py,users.py}
touch src/backend/auth-service/services/{__init__.py,auth_service.py}
touch src/backend/auth-service/models/{__init__.py,schemas.py,db_models.py}
touch src/backend/auth-service/repositories/{__init__.py,user_repository.py}
touch src/backend/auth-service/dependencies/{__init__.py,auth.py,db.py}
touch src/backend/auth-service/tests/{__init__.py,conftest.py,test_auth.py,test_users.py}
```

- Write `src/backend/auth-service/requirements.txt` with exact pins:

```
fastapi==0.111.0
uvicorn[standard]==0.29.0
sqlalchemy[asyncio]==2.0.30
asyncpg==0.29.0
pydantic-settings==2.2.1
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
httpx==0.27.0
slowapi==0.1.9
structlog==24.1.0
pytest==8.2.0
pytest-asyncio==0.23.6
anyio[trio]==4.3.0
aiosqlite==0.20.0
```

- `aiosqlite` is for the in-memory SQLite test database; `anyio[trio]` is required by `pytest-asyncio`

---

**Step 2 — Write `.env.example`**

```
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/eclaims_auth
JWT_SECRET_KEY=change-me-to-a-random-256-bit-hex-string
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
APP_ENV=development
LOG_LEVEL=INFO
```

- `JWT_SECRET_KEY` must never appear in source; read only via `config.py` at runtime

---

**Step 3 — Implement `config.py`**

- Define `Settings(BaseSettings)` from `pydantic_settings`
- Fields: `database_url: str`, `jwt_secret_key: str`, `jwt_algorithm: str = "HS256"`, `access_token_expire_minutes: int = 15`, `refresh_token_expire_days: int = 7`, `app_env: str = "development"`, `log_level: str = "INFO"`
- Inner class `model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)`
- Expose module-level singleton: `settings = Settings()` — all modules import from here, never from `os.environ` directly

---

**Step 4 — Define ORM model in `models/db_models.py`**

- Create `Base = DeclarativeBase()`
- Define `User(Base)` with `__tablename__ = "users"` and columns:

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
email           VARCHAR(255) UNIQUE NOT NULL
hashed_password VARCHAR(255) NOT NULL
full_name       VARCHAR(255)
address         VARCHAR(500)
role            VARCHAR(50) NOT NULL DEFAULT 'CUSTOMER'
is_active       BOOLEAN NOT NULL DEFAULT TRUE
created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

- Use `mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)` for `id`
- Set `server_default=func.now()` on both timestamp columns; `onupdate=func.now()` on `updated_at`
- Store role as plain `VARCHAR(50)` — validated at the Pydantic layer, no DB Enum

---

**Step 5 — Define Pydantic schemas in `models/schemas.py`**

- `UserRole` as `str` enum: `CUSTOMER`, `CASE_MANAGER`, `SURVEYOR`, `ADJUSTOR`, `AUDITOR`, `REGIONAL_MANAGER`
- Schemas:
  - `UserRegisterRequest`: `email: EmailStr`, `password: str` (min 8 chars), `full_name: str | None`
  - `UserLoginRequest`: `email: EmailStr`, `password: str`
  - `TokenResponse`: `access_token: str`, `refresh_token: str`, `token_type: str = "bearer"`
  - `RefreshRequest`: `refresh_token: str`
  - `UserResponse`: `id: UUID`, `email`, `full_name`, `role: UserRole`, `is_active`, `created_at`; add `model_config = ConfigDict(from_attributes=True)`
  - `UserUpdateRequest`: `full_name: str | None`, `address: str | None` — all fields optional

---

**Step 6 — Set up async DB engine in `dependencies/db.py`**

- `engine = create_async_engine(settings.database_url, echo=False, pool_pre_ping=True)`
- `AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)`
- FastAPI dependency `get_db()` — yields session, rolls back on exception, closes in `finally`
- Expose `create_tables()` calling `Base.metadata.create_all` — called from `main.py` lifespan only

---

**Step 7 — Implement `repositories/user_repository.py`**

- Class `UserRepository(db: AsyncSession)` with async methods:
  - `get_by_email(email) -> User | None`
  - `get_by_id(user_id: UUID) -> User | None`
  - `create(email, hashed_password, full_name, role) -> User` — add, commit, refresh, return
  - `update(user, **kwargs) -> User` — set attrs, commit, refresh
- Use `await db.execute(stmt)` then `.scalar_one_or_none()` for all SELECTs

---

**Step 8 — Implement `services/auth_service.py`**

- `pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")`
- `hash_password(plain) -> str`; `verify_password(plain, hashed) -> bool`
- `create_jwt(data: dict, expires_delta: timedelta) -> str`:
  - Adds `exp` and `iat` to a copy of `data`; encodes with `jose.jwt.encode` using `settings.jwt_secret_key`
- `decode_jwt(token) -> dict`:
  - On `ExpiredSignatureError` → HTTP 401 "Token expired"; on `JWTError` → HTTP 401 "Invalid token"
- `create_token_pair(user) -> TokenResponse`:
  - Access token payload: `{sub, email, role, type: "access"}`, expires in `ACCESS_TOKEN_EXPIRE_MINUTES`
  - Refresh token payload: `{sub, type: "refresh"}`, expires in `REFRESH_TOKEN_EXPIRE_DAYS` days

---

**Step 9 — Implement `dependencies/auth.py`**

- `oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")`
- Dependency `get_current_user(token, db) -> User`:
  - Decodes JWT; asserts `type == "access"`; fetches user by `sub`; raises 401 if inactive
- Factory `require_role(*roles)` returning a dependency that raises HTTP 403 if `user.role not in roles`

---

**Step 10 — Configure structlog JSON logger in `logging_config.py`**

- Call `structlog.configure()` with processors: `merge_contextvars`, `add_log_level`, `TimeStamper(fmt="iso")`, `JSONRenderer()`
- In `main.py`, add `@app.middleware("http")` that:
  - Reads `X-Request-ID` header (or generates `str(uuid4())`)
  - Calls `structlog.contextvars.bind_contextvars(correlation_id=request_id)` before `call_next`
  - Logs `method`, `path`, `status_code`, `duration_ms` at request end
  - Clears context vars in `finally`

---

**Step 11 — Configure slowapi rate limiter**

- In `main.py`: `limiter = Limiter(key_func=get_ipaddr)`; `app.state.limiter = limiter`
- Register `RateLimitExceeded` handler and `SlowAPIMiddleware`
- The `@limiter.limit("10/minute")` decorator is applied in the router (Step 12), not here

---

**Step 12 — Implement `api/routers/auth.py`**

- `router = APIRouter(prefix="/auth", tags=["auth"])`
- `POST /auth/register`: check for duplicate email (409); hash password; create user with `CUSTOMER` role; return `UserResponse` HTTP 201
- `POST /auth/login`: decorated `@limiter.limit("10/minute")`; signature includes `request: Request` as first param (slowapi requirement); lookup user; verify password; return `create_token_pair(user)`; use same error message for both wrong email and wrong password (no enumeration)
- `POST /auth/refresh`: decode refresh token; assert `type == "refresh"`; rotate both tokens via `create_token_pair`

---

**Step 13 — Implement `api/routers/users.py`**

- `GET /users/me` → `UserResponse.model_validate(current_user)`
- `PATCH /users/me` → `body.model_dump(exclude_unset=True)` → `user_repo.update()`; return updated `UserResponse`
- Add stub `GET /users/all` protected with `require_role("CASE_MANAGER", "REGIONAL_MANAGER")` — used by the 403 test case

---

**Step 14 — Assemble `main.py`**

- Import and call `configure_logging()` at module top before app creation
- `app = FastAPI(title="eClaims Auth Service", version="0.1.0")`
- Lifespan: on startup `await create_tables()`; on shutdown `await engine.dispose()`
- Register `SlowAPIMiddleware`, logging middleware, both routers, `GET /health` endpoint

---

**Step 15 — Write `Dockerfile`**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
ENV PYTHONUNBUFFERED=1
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

**Step 16 — Write `tests/conftest.py`**

- Set `asyncio_mode = "auto"` in `pytest.ini`
- Override `settings.database_url` to `"sqlite+aiosqlite:///:memory:"` before engine creation
- Fixture `db_session` (function scope): wraps each test in a SAVEPOINT transaction; rolls back after test — no data leaks
- Fixture `client`: `AsyncClient(app=app, base_url="http://test")`; overrides `get_db` with `db_session`
- Helper fixture `registered_user(client)`: POSTs to `/auth/register` with a canned email/password; returns response JSON

---

**Step 17 — Write `tests/test_auth.py`**

- `test_register_and_login`: register → 201; login → 200 + `access_token` + `refresh_token`
- `test_wrong_password_returns_401`
- `test_expired_token_returns_401`: generate token with `expires_delta=timedelta(seconds=-1)`; call `GET /users/me`
- `test_refresh_rotates_tokens`: new `access_token` differs from original
- `test_rate_limit_on_login`: 11 rapid calls → 11th is 429
- `test_refresh_with_access_token_rejected`: pass access token to `POST /auth/refresh` → 401

---

**Step 18 — Write `tests/test_users.py`**

- `test_get_me_returns_profile`: 200, `role == "CUSTOMER"`
- `test_get_me_without_token_returns_401`
- `test_patch_me_updates_name`: 200, `full_name == "Jane Doe"`
- `test_role_restricted_endpoint_returns_403`: CUSTOMER hitting `GET /users/all` → 403

---

**Step 19 — Install and run the test suite**

```shell
cd src/backend/auth-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest -v
```

All 10 tests must pass. Verify Swagger UI at `http://localhost:8001/docs` shows all six routes.

---

### Agent B: Infrastructure Foundation

**Step 1 — Create the infrastructure directory skeleton**

```bash
mkdir -p infrastructure/db infrastructure/nginx
```

---

**Step 2 — Write `infrastructure/db/init.sql` — schema**

- Open with `CREATE EXTENSION IF NOT EXISTS "pgcrypto";`
- Create table **users**: `id UUID PK DEFAULT gen_random_uuid()`, `email TEXT UNIQUE NOT NULL`, `password_hash TEXT NOT NULL`, `role TEXT NOT NULL CHECK (role IN ('CUSTOMER','ADJUSTOR','SURVEYOR','CASE_MANAGER','AUDITOR','REGIONAL_MANAGER'))`, `full_name TEXT NOT NULL`, `is_active BOOLEAN DEFAULT TRUE`, `created_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ DEFAULT NOW()`
- Create table **claims**: `id UUID PK`, `claim_number TEXT UNIQUE NOT NULL`, `customer_id UUID NOT NULL REFERENCES users(id)`, `policy_number TEXT NOT NULL`, `status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','ASSIGNED','UNDER_SURVEY','SURVEYED','UNDER_ADJUDICATION','APPROVED','REJECTED','PAID'))`, `amount_claimed NUMERIC(12,2) NOT NULL`, `amount_approved NUMERIC(12,2)`, `description TEXT`, `assigned_adjuster_id UUID REFERENCES users(id)`, `assigned_surveyor_id UUID REFERENCES users(id)`, `incident_date DATE NOT NULL`, `submitted_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ DEFAULT NOW()`
- Create table **claim_documents**: `id UUID PK`, `claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE`, `uploaded_by UUID NOT NULL REFERENCES users(id)`, `file_name TEXT NOT NULL`, `file_path TEXT NOT NULL`, `file_size_bytes BIGINT`, `mime_type TEXT`, `uploaded_at TIMESTAMPTZ DEFAULT NOW()`
- Create table **claim_status_history**: `id UUID PK`, `claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE`, `changed_by UUID NOT NULL REFERENCES users(id)`, `from_status TEXT`, `to_status TEXT NOT NULL`, `notes TEXT`, `changed_at TIMESTAMPTZ DEFAULT NOW()`
- Create table **notifications**: `id UUID PK`, `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`, `claim_id UUID REFERENCES claims(id) ON DELETE SET NULL`, `message TEXT NOT NULL`, `is_read BOOLEAN DEFAULT FALSE`, `created_at TIMESTAMPTZ DEFAULT NOW()`
- Add indexes:

```sql
CREATE INDEX ON claims(customer_id);
CREATE INDEX ON claims(status);
CREATE INDEX ON claim_status_history(claim_id);
CREATE INDEX ON notifications(user_id, is_read);
```

---

**Step 3 — Append seed data — 6 test users**

- Generate the bcrypt hash for `Test1234!` before inserting:

```bash
python -c "import bcrypt; print(bcrypt.hashpw(b'Test1234!', bcrypt.gensalt(12)).decode())"
```

- Use `ON CONFLICT (email) DO NOTHING` so re-running `init.sql` is idempotent:

```sql
INSERT INTO users (email, password_hash, role, full_name) VALUES
  ('customer@test.com',    '<bcrypt-hash>', 'CUSTOMER',         'Alice Customer'),
  ('adjuster@test.com',    '<bcrypt-hash>', 'ADJUSTOR',         'Bob Adjuster'),
  ('surveyor@test.com',    '<bcrypt-hash>', 'SURVEYOR',         'Carol Surveyor'),
  ('casemanager@test.com', '<bcrypt-hash>', 'CASE_MANAGER',     'David Case'),
  ('auditor@test.com',     '<bcrypt-hash>', 'AUDITOR',          'Eve Auditor'),
  ('manager@test.com',     '<bcrypt-hash>', 'REGIONAL_MANAGER', 'Frank Manager')
ON CONFLICT (email) DO NOTHING;
```

---

**Step 4 — Append seed data — 3 sample claims + status history**

- Use a CTE to resolve user IDs by email (avoids hardcoded UUIDs):

```sql
WITH usr AS (
  SELECT id, email FROM users
  WHERE email IN (
    'customer@test.com','adjuster@test.com',
    'surveyor@test.com','casemanager@test.com'
  )
)
INSERT INTO claims
  (claim_number, customer_id, policy_number, status, amount_claimed,
   amount_approved, assigned_adjuster_id, assigned_surveyor_id, incident_date, description)
VALUES
  ('CLM-2024-001',
   (SELECT id FROM usr WHERE email='customer@test.com'),
   'POL-001','SUBMITTED',15000.00,NULL,NULL,NULL,
   '2024-11-15','Hospitalisation claim for surgery'),
  ('CLM-2024-002',
   (SELECT id FROM usr WHERE email='customer@test.com'),
   'POL-002','UNDER_ADJUDICATION',45000.00,NULL,
   (SELECT id FROM usr WHERE email='adjuster@test.com'),
   NULL,'2024-10-22','Rear-end collision on highway'),
  ('CLM-2024-003',
   (SELECT id FROM usr WHERE email='customer@test.com'),
   'POL-003','APPROVED',120000.00,95000.00,
   (SELECT id FROM usr WHERE email='adjuster@test.com'),
   (SELECT id FROM usr WHERE email='surveyor@test.com'),
   '2024-09-05','Flood damage to ground floor')
ON CONFLICT (claim_number) DO NOTHING;
```

- Insert status history rows per claim (CLM-001: 1 row; CLM-002: 2 rows; CLM-003: 4 rows) covering the full status progression for each.

---

**Step 5 — Write `.env.example` at the repo root**

```bash
# Copy to .env and fill in every blank value before running:
#   cp .env.example .env
# Never commit .env

POSTGRES_USER=
POSTGRES_PASSWORD=
POSTGRES_DB=
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}

# Generate with: python -c "import secrets; print(secrets.token_hex(32))"
JWT_SECRET_KEY=
JWT_ALGORITHM=HS256

AUTH_SERVICE_URL=http://auth-service:8001
REDIS_URL=redis://redis:6379/0
```

---

## Phase 2 — Sequential (1 Agent): claims-service

**Step 1 — Create directory tree and `requirements.txt`**

- Create the full directory structure under `src/backend/claims-service/` with subdirectories `api/routers/`, `services/`, `models/`, `repositories/`, `dependencies/`, `tests/`, each with `__init__.py`
- `requirements.txt`:

```
fastapi==0.111.0
uvicorn[standard]==0.29.0
sqlalchemy[asyncio]==2.0.30
asyncpg==0.29.0
pydantic-settings==2.2.1
python-multipart==0.0.9
httpx==0.27.0
aiofiles==23.2.1
redis==5.0.4
python-magic==0.4.27
structlog==24.1.0
pytest==8.2.0
pytest-asyncio==0.23.6
```

---

**Step 2 — Write `.env.example` and `config.py`**

```
DATABASE_URL=postgresql+asyncpg://claims_user:secret@localhost:5432/claims_db
REDIS_URL=redis://localhost:6379/0
AUTH_SERVICE_URL=http://auth-service:8001
UPLOAD_DIR=/app/uploads
MAX_FILE_SIZE_MB=10
LOG_LEVEL=INFO
ENVIRONMENT=development
```

- `Settings(BaseSettings)` mirrors every env variable; add `@computed_field max_file_bytes: int` returning `MAX_FILE_SIZE_MB * 1024 * 1024`
- Add `ALLOWED_EXTENSIONS: list[str] = [".pdf", ".jpg", ".jpeg", ".png"]`
- Add `ALLOWED_MIMES: list[str] = ["application/pdf", "image/jpeg", "image/png"]`
- Add `REDIS_CACHE_TTL: int = 60`
- Export module-level singleton `settings = Settings()`

---

**Step 3 — Define SQLAlchemy ORM models in `models/db_models.py`**

- `ClaimStatus` as `StrEnum`: `SUBMITTED`, `ASSIGNED`, `UNDER_SURVEY`, `SURVEYED`, `UNDER_ADJUDICATION`, `APPROVED`, `REJECTED`, `PAID`
- `Claim` (table `claims`): `id UUID PK`, `claim_number VARCHAR(25) UNIQUE NOT NULL`, `customer_id UUID NOT NULL`, `policy_number str`, `incident_date date`, `incident_description TEXT`, `claimed_amount Numeric(12,2)`, `status Enum(ClaimStatus) DEFAULT SUBMITTED`, `assigned_to UUID nullable`, `created_at / updated_at TIMESTAMPTZ`
- `ClaimDocument` (table `claim_documents`): `id`, `claim_id FK ON DELETE CASCADE`, `filename`, `stored_path`, `mime_type`, `file_size_bytes`, `uploaded_by UUID`, `uploaded_at`
- `ClaimStatusHistory` (table `claim_status_history`): `id`, `claim_id FK`, `from_status nullable`, `to_status`, `changed_by UUID`, `changed_at`, `note TEXT nullable`
- `Notification` (table `notifications`): `id`, `claim_id FK`, `recipient_id UUID`, `channel`, `message TEXT`, `sent_at`, `status DEFAULT "stub"`
- Add PostgreSQL sequence `claim_seq` (START 1, INCREMENT 1)

---

**Step 4 — Write DDL migration script `migrations/001_initial_schema.sql`**

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE claim_status AS ENUM (
  'SUBMITTED','ASSIGNED','UNDER_SURVEY','SURVEYED',
  'UNDER_ADJUDICATION','APPROVED','REJECTED','PAID'
);

CREATE SEQUENCE claim_seq START 1 INCREMENT 1;

CREATE TABLE claims (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_number     VARCHAR(25) NOT NULL UNIQUE,
  customer_id      UUID NOT NULL,
  policy_number    VARCHAR(50) NOT NULL,
  incident_date    DATE NOT NULL,
  incident_description TEXT NOT NULL,
  claimed_amount   NUMERIC(12,2) NOT NULL,
  status           claim_status NOT NULL DEFAULT 'SUBMITTED',
  assigned_to      UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- (claim_documents, claim_status_history, notifications tables follow same pattern)

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER claims_updated_at
  BEFORE UPDATE ON claims
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

**Step 5 — Define Pydantic schemas in `models/schemas.py`**

- `ClaimCreate`: `policy_number`, `incident_date`, `incident_description`, `claimed_amount`; validator ensures `claimed_amount > 0`
- `ClaimResponse`: all `Claim` columns; `from_attributes=True`
- `ClaimListResponse`: `items: list[ClaimResponse]`, `total: int`
- `StatusUpdateRequest`: `status: ClaimStatus`, `note: str | None`
- `DocumentResponse`: mirrors `ClaimDocument` + `download_url: str`
- `HistoryEntry`: mirrors `ClaimStatusHistory`
- `UserContext`: `id: UUID`, `email: str`, `role: str`
- `HealthResponse`: `status: str`, `db: str`, `redis: str`

---

**Step 6 — Implement async DB engine in `dependencies/db.py`**

- `engine = create_async_engine(settings.DATABASE_URL, pool_size=10, max_overflow=20)`
- `AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)`
- Dependency `get_db()`: `async with AsyncSessionLocal() as session`; yield; commit on success, rollback on exception

---

**Step 7 — Implement auth dependency in `dependencies/auth.py`**

- `get_current_user(request, credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer())) -> UserContext`
- Use a **module-level** `httpx.AsyncClient` (created at startup, closed at shutdown) — not per-request
- Call `GET {settings.AUTH_SERVICE_URL}/users/me` with `Authorization: Bearer {token}` and `X-Request-ID: {request_id}`; `timeout=5.0`
- On `httpx.TimeoutException` → HTTP 503; on 401/403 from auth-service → HTTP 401; on other non-2xx → HTTP 502
- `require_role(*roles)` — raises HTTP 403 if `user.role` not in roles

---

**Step 8 — Implement `repositories/claim_repository.py`**

- `generate_claim_number()`: execute `SELECT 'CLM-' || TO_CHAR(now(), 'YYYYMMDD') || '-' || LPAD(nextval('claim_seq')::text, 5, '0')`
- `create(data, customer_id) -> Claim`; `get_by_id(claim_id) -> Claim | None`; `list_claims(customer_id, skip, limit) -> (list, total)`; `update_status(claim, new_status, changed_by, note) -> Claim`; `get_history(claim_id) -> list[ClaimStatusHistory]`

---

**Step 9 — Implement `repositories/document_repository.py`**

- `create(claim_id, filename, stored_path, mime_type, file_size_bytes, uploaded_by) -> ClaimDocument`
- `list_for_claim(claim_id) -> list[ClaimDocument]`
- `get_by_id(doc_id, claim_id) -> ClaimDocument | None` — filter both fields to prevent cross-claim access

---

**Step 10 — Implement `services/document_service.py` — file validation and storage**

- Async `validate_and_store(file, claim_id, settings) -> (stored_path, mime_type, size_bytes)`:
  - **A — Extension check**: `Path(file.filename).suffix.lower()` in `ALLOWED_EXTENSIONS`; HTTP 415 if not
  - **B — Size check**: `contents = await file.read()`; `len(contents) > max_file_bytes` → HTTP 413
  - **C — MIME sniff**: `magic.from_buffer(contents, mime=True)`; result not in `ALLOWED_MIMES` → HTTP 415 "File content does not match allowed types"
  - **D — Persist**: `dest_dir = Path(UPLOAD_DIR) / str(claim_id)`; `aiofiles.open` write; filename is `{uuid4()}{suffix}`

---

**Step 11 — Implement `services/claims_service.py` — state machine + Redis cache**

- Transition table (dict of `current_status` → `{role: set of allowed targets}`)

```python
TRANSITIONS = {
  ClaimStatus.SUBMITTED:           {"CASE_MANAGER": {ClaimStatus.ASSIGNED}},
  ClaimStatus.ASSIGNED:            {"SURVEYOR":     {ClaimStatus.UNDER_SURVEY}},
  ClaimStatus.UNDER_SURVEY:        {"SURVEYOR":     {ClaimStatus.SURVEYED}},
  ClaimStatus.SURVEYED:            {"ADJUSTOR":     {ClaimStatus.UNDER_ADJUDICATION}},
  ClaimStatus.UNDER_ADJUDICATION:  {"ADJUSTOR":     {ClaimStatus.APPROVED, ClaimStatus.REJECTED}},
  ClaimStatus.APPROVED:            {"ADJUSTOR":     {ClaimStatus.PAID}},
  # REJECTED and PAID are terminal
}
```

- `validate_transition(current, requested, role)`: `CASE_MANAGER` can override to any status; all others must match `TRANSITIONS`; HTTP 400 on invalid with message `"Invalid state transition: {current} → {requested} not allowed for role {role}"`
- `update_status(claim_id, req, user)`: validate → `repo.update_status()` → `await redis.delete(f"claim:{claim_id}:status")` → `notification_service.send()`
- `get_claim_status_cached(claim_id)`: check Redis `claim:{id}:status`; on miss query DB and `redis.setex(key, REDIS_CACHE_TTL, value)`

---

**Step 12 — Implement `services/notification_service.py` — stub**

- `log = structlog.get_logger(__name__)`
- `send(claim_id, recipient_id, channel, message)`: `log.info("notification.stub", ...)` + insert `Notification` ORM row with `status="stub"`; flush only (no commit)

---

**Step 13 — Implement `api/routers/claims.py`**

- `POST /claims` (CUSTOMER): 201 `ClaimResponse`
- `GET /claims` (all roles): `skip / limit` query params; customers see only own claims
- `GET /claims/{id}` (all roles): CUSTOMER ownership check → 403 if mismatch
- `PATCH /claims/{id}/status`: `StatusUpdateRequest` body → `service.update_status()`
- `GET /claims/{id}/history`: ownership check; return `list[HistoryEntry]`

---

**Step 14 — Implement `api/routers/documents.py`**

- `POST /claims/{id}/documents` (CUSTOMER, SURVEYOR, ADJUSTOR): role check → ownership check → `validate_and_store()` → `doc_repo.create()`; 201
- `GET /claims/{id}/documents` (all roles): ownership check → `doc_repo.list_for_claim()`
- `GET /claims/{id}/documents/{doc_id}/download` (all roles): ownership check → `doc_repo.get_by_id()` → `FileResponse(path, media_type, filename)`

---

**Step 15 — Implement `main.py`**

- Configure structlog at module top; define lifespan:
  - Startup: create `httpx.AsyncClient(timeout=5.0)` on `app.state.http_client`; create `redis.asyncio.from_url(settings.REDIS_URL)` on `app.state.redis`; ping Redis; `Base.metadata.create_all` if dev
  - Shutdown: close http_client, redis, engine
- Add `RequestIDMiddleware`; include both routers; add `GET /health` checking DB + Redis

---

**Step 16 — Write `tests/conftest.py`**

- `asyncio_mode = "auto"` in `pytest.ini`
- `db_session` fixture: SAVEPOINT-based rollback per test
- `mock_redis`: `fakeredis.aioredis.FakeRedis()`
- User fixtures: `customer_user`, `case_manager_user`, `surveyor_user`, `adjustor_user` returning `UserContext` objects
- `client` fixture: `AsyncClient(app=app)`; overrides `get_db`, `get_redis`, `get_current_user`
- `sample_claim` fixture: inserts a SUBMITTED claim via `ClaimRepository`

---

**Step 17 — Write `tests/test_claims.py`**

- `test_submit_claim_as_customer`: 201, `status == "SUBMITTED"`, `claim_number` matches `CLM-\d{8}-\d{5}`
- `test_submit_claim_non_customer_forbidden`: 403
- `test_customer_sees_only_own_claims`
- `test_adjustor_sees_all_claims`
- `test_invalid_state_transition_returns_400`: detail contains "Invalid state transition"
- `test_valid_state_transition_updates_history`: 2 history entries with correct statuses
- `test_case_manager_override_to_any_status`: SUBMITTED → APPROVED directly → 200
- `test_redis_cache_hit_skips_db`: mock DB execute; confirm not called on cache hit

---

**Step 18 — Write `tests/test_documents.py`**

- `test_upload_valid_pdf`: 201, `mime_type == "application/pdf"`
- `test_download_document_by_owner`: response bytes match uploaded content
- `test_unauthorized_download_forbidden`: 403 for different customer UUID
- `test_upload_exe_disguised_as_pdf_returns_415`: Windows PE header bytes, named `report.pdf` → 415
- `test_upload_exceeds_10mb_returns_413`: `10 * 1024 * 1024 + 1` bytes → 413
- `test_non_allowed_role_cannot_upload`: case_manager uploading → 403
- All upload tests use `tmp_path` for `settings.UPLOAD_DIR`

---

**Step 19 — Write `Dockerfile`**

```dockerfile
FROM python:3.12-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends libmagic1 \
    && rm -rf /var/lib/apt/lists/*
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN mkdir -p /app/uploads
VOLUME ["/app/uploads"]
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

- `libmagic1` system package is required for `python-magic`; install in a single layer

---

**Step 20 — Run tests and verify health endpoint**

```shell
cd src/backend/claims-service
pip install -r requirements.txt
pytest -v --asyncio-mode=auto
```

All 14 test cases must pass. Verify `GET http://localhost:8002/health` returns `{"status":"ok","db":"ok","redis":"ok"}`.

---

## Phase 3 — Parallel (2 Agents)

### Agent A: customer-portal

**Step 1 — Scaffold the project and install dependencies**

- Create `src/frontend/customer-portal/`; write `package.json`:

```json
{
  "name": "eclaims-customer-portal",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": { "dev": "vite", "build": "tsc && vite build", "preview": "vite preview" },
  "dependencies": {
    "react": "^18.3.0", "react-dom": "^18.3.0",
    "react-router-dom": "^6.23.0", "axios": "^1.7.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0", "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0", "@vitejs/plugin-react": "^4.3.0", "vite": "^5.2.0"
  }
}
```

```shell
cd src/frontend/customer-portal && npm ci
```

---

**Step 2 — Write `tsconfig.json` and `vite.config.ts`**

- `tsconfig.json`: `strict: true`, `jsx: "react-jsx"`, `baseUrl: "."`, `paths: { "@/*": ["src/*"] }`, `noEmit: true`
- `vite.config.ts`: plugin `react()`, alias `@` → `./src`, `server.port: 3000`, `build.outDir: "dist"`

---

**Step 3 — Write `index.html` and `src/main.tsx`**

- `index.html`: standard Vite shell; `<title>eClaims — Customer Portal</title>`; mount div `id="root"`
- `src/main.tsx`: `ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)`

---

**Step 4 — Build `src/context/AuthContext.tsx`**

- `AuthContextValue`: `token: string | null`, `login(token): void`, `logout(): void`, `isAuthenticated: boolean`
- `AuthProvider`: initialise from `localStorage.getItem('eclaims_token')`
- `login(token)`: `localStorage.setItem` + update state
- `logout()`: `localStorage.removeItem` + set to `null`
- Export `useAuth` hook; throw if used outside provider

---

**Step 5 — Create `src/api/client.ts` with interceptors**

- `apiClient = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL })`
- Request interceptor: read `localStorage.getItem('eclaims_token')` → set `Authorization: Bearer {token}`
- Response interceptor: on 401 → `localStorage.removeItem` + `window.location.href = '/login'`

---

**Step 6 — Write `src/api/auth.ts` and `src/api/claims.ts`**

- `auth.ts`: `login(email, password) -> LoginResponse`; `register(payload) -> void`
- `claims.ts` exports: `ClaimStatus` union type; `Claim`, `ClaimHistoryEntry`, `ClaimDocument`, `SubmitClaimPayload` interfaces; functions: `getClaims()`, `getClaim(id)`, `submitClaim(data)`, `getClaimHistory(id)`, `getClaimDocuments(id)`, `uploadDocument(claimId, file)` (FormData + multipart), `downloadDocument(claimId, docId)` (responseType `'blob'`)

---

**Step 7 — Build `src/components/ClaimStatusBadge.tsx`**

- Props: `{ status: ClaimStatus }` — renders a color-coded pill:
  - `SUBMITTED=gray`, `ASSIGNED=blue`, `UNDER_SURVEY=purple`, `SURVEYED=teal`, `UNDER_ADJUDICATION=orange`, `APPROVED=green`, `REJECTED=red`, `PAID=gold`
- Human-readable label (e.g. `"Under Survey"`, not `"UNDER_SURVEY"`); inline styles only

---

**Step 8 — Build `src/components/FileUpload.tsx`**

- Props: `{ onFileSelect: (file: File) => void; disabled?: boolean }`
- `ACCEPTED_TYPES = ["image/jpeg", "image/png", "application/pdf"]`; `MAX_BYTES = 10 * 1024 * 1024`
- `validateFile(file)`: returns error string or `null`
- Drag-and-drop events: `onDragEnter/Over` set `isDragging = true` and `e.preventDefault()`; `onDrop` validates, updates state, calls `onFileSelect`
- Hidden `<input type="file" accept=".jpg,.jpeg,.png,.pdf">` triggered via ref
- Show file name + formatted size on valid selection; red error message below on invalid

---

**Step 9 — Build `src/components/StatusTimeline.tsx`**

- Props: `{ history: ClaimHistoryEntry[] }` — sort ascending by `changed_at`
- Each entry: `ClaimStatusBadge` + formatted timestamp + `"Changed by: {changed_by}"` + optional notes
- Vertical connecting line via CSS left-border on container; circular dot marker at each entry

---

**Step 10 — Build `src/pages/Login.tsx`**

- State: `email`, `password`, `error`, `loading`
- On submit: call `login(email, password)` → `authContext.login(token)` → navigate to `/dashboard`; set `error` on failure (never surface raw server messages)
- If already authenticated: `<Navigate to="/dashboard" replace />`
- Submit button disabled + "Signing in…" while loading

---

**Step 11 — Build `src/pages/Dashboard.tsx`**

- On mount: `getClaims()` → `claims: Claim[]`
- Render claim cards with `ClaimStatusBadge`; each card navigates to `/claims/{id}` on click
- Empty state: "You have no claims yet." + Submit button
- Logout button: `authContext.logout()` + navigate to `/login`

---

**Step 12 — Build `src/pages/SubmitClaim.tsx`**

- Fields: `policy_number`, `incident_date` (max = today), `incident_description` (minLength 20), `incident_location`, optional `<FileUpload>`
- On submit: `submitClaim(data)` → if `selectedFile` → `uploadDocument(newClaim.id, file)` → navigate to `/claims/{id}`
- Keep form data intact on error so user can retry; button text "Submit Claim" / "Submitting…"

---

**Step 13 — Build `src/pages/ClaimDetail.tsx`**

- `useParams<{ id: string }>()`; on mount fire `Promise.all([getClaim(id), getClaimHistory(id), getClaimDocuments(id)])`
- Render: header with badge + back link; details grid; documents list with Download button (blob → object URL → programmatic `<a>` click → `revokeObjectURL`); `<StatusTimeline>`

---

**Step 14 — Wire routing in `src/App.tsx`**

- `PrivateRoute`: `useAuth().isAuthenticated` → `<Outlet />` or `<Navigate to="/login" replace />`
- Wrap in `<AuthProvider>` inside `<BrowserRouter>`; routes: `/login`, `/dashboard`, `/submit-claim`, `/claims/:id`

---

**Step 15 — Write multi-stage `Dockerfile`**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL=http://localhost:8000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

---

**Step 16 — Write `nginx.conf` for SPA routing**

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    gzip on;
    gzip_types text/plain text/css application/javascript application/json;
    location / { try_files $uri $uri/ /index.html; }
    location ~* \.(js|css|png|jpg|jpeg|svg|ico|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

- `try_files … /index.html` is required for React Router to work on direct URL access

---

**Step 17 — Create `.env.local`, run dev server, verify Docker build**

```shell
# Dev server
echo "VITE_API_BASE_URL=http://localhost:8000" > .env.local
npm run dev        # confirm Login page renders at http://localhost:3000

# Production build
npm run build      # dist/ created with no TypeScript errors

# Docker smoke test
docker build -t eclaims-customer-portal .
docker run -p 8080:80 eclaims-customer-portal
# http://localhost:8080 → Login page loads; all routes work
```

---

### Agent B: internal-portal

**Step 1 — Scaffold project and install dependencies**

```shell
cd src/frontend/internal-portal
npm create vite@latest . -- --template react-ts
npm install react-router-dom@6 axios
npm install -D @types/node
```

---

**Step 2 — Write `vite.config.ts` and `tsconfig.json`**

- `vite.config.ts`: alias `@` → `./src`; `server.port: 3001` (avoids clash with customer-portal on 3000)
- `tsconfig.json`: `baseUrl: "."`, `paths: { "@/*": ["src/*"] }`, `strict: true`

---

**Step 3 — Write `index.html` and `src/main.tsx`**

- `<title>eClaims Internal Portal</title>`; mount `<div id="root">`
- `main.tsx`: wrap in `<BrowserRouter>` + `<AuthProvider>`

---

**Step 4 — Implement `src/context/AuthContext.tsx`**

- `UserRole` union: `'CASE_MANAGER' | 'SURVEYOR' | 'ADJUSTOR' | 'AUDITOR' | 'REGIONAL_MANAGER'`
- `AuthUser`: `{ id, name, email, role: UserRole }`
- Store JWT in `localStorage` under key `'internal_token'`; decode payload on mount to rehydrate `currentUser`
- `login(email, password)`: calls `authApi.login()`, stores JWT, decodes payload (`atob(token.split('.')[1])`) for `currentUser`
- `logout()`: remove from localStorage, set `currentUser` to `null`, navigate to `/login`

---

**Step 5 — Implement `src/api/client.ts`**

- `axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL, timeout: 15000 })`
- Request interceptor: attach `internal_token` Bearer header
- Response interceptor: on 401 → remove token + `window.location.href = '/login'`

---

**Step 6 — Implement `src/api/auth.ts` and `src/api/claims.ts`**

- `auth.ts`: `login(email, password)`, `me()` → `AuthUser`
- `claims.ts`: `listClaims(params?: ClaimFilterParams)`, `getClaim(id)`, `updateClaimStatus(id, body: StatusUpdateBody)`, `listDocuments(claimId)`, `downloadDocument(claimId, docId)` (responseType `'blob'`)

---

**Step 7 — Define shared types in `src/types/index.ts`**

- `ClaimStatus` union; `Claim` interface (with `assigned_staff_name?`, `approved_amount?`); `ClaimDocument`; `UserRole`; `AuthUser`

---

**Step 8 — Implement `src/App.tsx` with role-aware `PrivateRoute`**

- `PrivateRoute({ allowedRoles?: UserRole[] })`: unauthenticated → `/login`; wrong role → `/dashboard`; else `<Outlet />`
- Routes: `/login` (open); `/dashboard`, `/claims/:id` (any authenticated role); `/reports` (CASE_MANAGER, REGIONAL_MANAGER only)
- Wrap pages in `React.lazy` + `<Suspense>`

---

**Step 9 — Implement `src/pages/Login.tsx`**

- Same controlled form pattern as customer-portal; on success navigate to `/dashboard`; title "Internal Staff Login — eClaims"

---

**Step 10 — Build `src/components/ClaimStatusBadge.tsx`**

- Same status map as customer-portal; pill style with `background = color at 12% opacity`, `color = full opacity`

---

**Step 11 — Build `src/components/ClaimsTable.tsx`**

- Props: `claims: Claim[]`, `onRowClick: (id: string) => void`, `roleVisibility: UserRole`
- Columns: claim number, policy, customer name, status badge, incident date, assigned staff (hidden when `AUDITOR`)
- Sortable by incident date (local state `sortDir`); filterable by status select and date range inputs
- All filtering + sorting via `useMemo`; rows keyboard-focusable (Enter/Space fires `onRowClick`)

---

**Step 12 — Build `src/components/StatusActionPanel.tsx`**

- Props: `claim`, `role`, `onActionComplete`, `staffList`
- All actions call `claimsApi.updateClaimStatus(claim.id, body)` → `onActionComplete()` on success
- `CASE_MANAGER`: "Assign to Surveyor/Adjustor" (assignee select), "Override Status" (full status picker)
- `SURVEYOR`: "Start Survey" (enabled when `ASSIGNED`), "Submit Assessment" (enabled when `UNDER_SURVEY`; required notes textarea)
- `ADJUSTOR`: "Begin Adjudication" (SURVEYED), "Approve" (UNDER_ADJUDICATION; required amount > 0), "Reject" (required rejection notes)
- `AUDITOR`: renders `null`
- Show inline error and disabled/spinner state during loading

---

**Step 13 — Build `src/components/ClaimDocumentViewer.tsx`**

- Props: `claimId: string`, `documents: ClaimDocument[]`
- Download button: fetch blob → `URL.createObjectURL` → programmatic `<a>` click → `revokeObjectURL`
- Empty state: "No documents attached"

---

**Step 14 — Implement `src/pages/Dashboard.tsx`**

- `claimsApi.listClaims()` on mount → `ClaimsTable` with role-aware column visibility
- Nav bar: show user name + role; "Reports" link only for CASE_MANAGER / REGIONAL_MANAGER; Logout button

---

**Step 15 — Implement `src/pages/ClaimDetail.tsx`**

- `Promise.all([getClaim(id), listDocuments(id)])` on mount; re-fetch both on `onActionComplete`
- Two-column layout: left = claim fields + `ClaimDocumentViewer`; right = `StatusActionPanel`
- AUDITOR: `StatusActionPanel` renders nothing; read-only display

---

**Step 16 — Implement `src/pages/Reports.tsx`**

- Accessible only to CASE_MANAGER + REGIONAL_MANAGER (enforced by `PrivateRoute`)
- Client-side computations via `useMemo` (no backend aggregation endpoint in POC):
  - Processing time: `Date.now() - new Date(claim.created_at).getTime()` in days
  - Amounts paid: `claim.approved_amount` where `status === 'APPROVED'`
  - Status breakdown: reduce to `Record<ClaimStatus, number>`
- Summary row above table: e.g. "Approved: 12 · Rejected: 3 · Under Adjudication: 5"
- Approved amount via `Intl.NumberFormat` with locale `en-IN`, style `currency`, currency `INR`

---

**Step 17 — Write multi-stage `Dockerfile`**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL=http://localhost:8000/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:1.27-alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

---

**Step 18 — Write `nginx.conf`**

```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;
  location / { try_files $uri $uri/ /index.html; }
  location ~* \.(js|css|png|jpg|svg|ico|woff2)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }
}
```

---

**Step 19 — TypeScript check, build, and Docker smoke test**

```shell
npx tsc --noEmit
npm run build
docker build --build-arg VITE_API_BASE_URL=http://localhost:8000/api/v1 \
  -t eclaims-internal-portal:local .
docker run -p 3001:80 eclaims-internal-portal:local
```

- Log in with each seeded role; confirm role-specific columns, nav links, and action buttons appear correctly
- Navigate to `/reports` as AUDITOR → confirm redirect to `/dashboard`
- Hard-refresh a `/claims/:id` URL → confirm Nginx serves `index.html` (not a 404)

---

## Phase 4 — Sequential (1 Agent): Docker Compose Wiring + Smoke Test

**Step 1 — Write `infrastructure/nginx/customer-portal.conf`**

```nginx
server {
    listen 80;
    server_name _;
    root  /usr/share/nginx/html;
    index index.html;

    add_header X-Frame-Options           "DENY"                            always;
    add_header X-Content-Type-Options    "nosniff"                         always;
    add_header Referrer-Policy           "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';"
      always;

    location / { try_files $uri $uri/ /index.html; }

    location /api/auth/ {
        proxy_pass       http://auth-service:8001;
        proxy_set_header Host            $host;
        proxy_set_header X-Real-IP       $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Request-ID    $request_id;
    }

    location /api/claims/ {
        proxy_pass       http://claims-service:8002;
        proxy_set_header Host            $host;
        proxy_set_header X-Real-IP       $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Request-ID    $request_id;
    }
}
```

---

**Step 2 — Write `infrastructure/nginx/internal-portal.conf`**

- Identical structure to `customer-portal.conf` — same 4 security headers, same two proxy blocks, same `X-Request-ID` injection. The distinct built assets are baked into the image at Docker build time.

---

**Step 3 — Write `infrastructure/docker-compose.yml` — data services**

```yaml
version: '3.9'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER:     ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB:       ${POSTGRES_DB}
    volumes:
      - ./db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    healthcheck:
      test:     ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER"]
      interval: 10s
      timeout:  5s
      retries:  5

  redis:
    image: redis:7-alpine
    healthcheck:
      test:     ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout:  5s
      retries:  5
```

---

**Step 4 — Append backend services to `docker-compose.yml`**

```yaml
  auth-service:
    build: ../src/backend/auth-service
    ports:
      - "8001:8001"
    environment:
      DATABASE_URL:   ${DATABASE_URL}
      JWT_SECRET_KEY: ${JWT_SECRET_KEY}
      JWT_ALGORITHM:  ${JWT_ALGORITHM}
    depends_on:
      postgres: { condition: service_healthy }
    healthcheck:
      test:         ["CMD", "curl", "-f", "http://localhost:8001/health"]
      interval:     15s
      timeout:      5s
      retries:      5
      start_period: 10s

  claims-service:
    build: ../src/backend/claims-service
    ports:
      - "8002:8002"
    environment:
      DATABASE_URL:     ${DATABASE_URL}
      REDIS_URL:        ${REDIS_URL}
      JWT_SECRET_KEY:   ${JWT_SECRET_KEY}
      JWT_ALGORITHM:    ${JWT_ALGORITHM}
      AUTH_SERVICE_URL: ${AUTH_SERVICE_URL}
    volumes:
      - claims_uploads:/app/uploads
    depends_on:
      postgres:     { condition: service_healthy }
      redis:        { condition: service_healthy }
      auth-service: { condition: service_healthy }
    healthcheck:
      test:         ["CMD", "curl", "-f", "http://localhost:8002/health"]
      interval:     15s
      timeout:      5s
      retries:      5
      start_period: 10s
```

---

**Step 5 — Append frontend services and named volume to `docker-compose.yml`**

```yaml
  customer-portal:
    build: ../src/frontend/customer-portal
    ports:
      - "3000:80"
    volumes:
      - ./nginx/customer-portal.conf:/etc/nginx/conf.d/default.conf:ro

  internal-portal:
    build: ../src/frontend/internal-portal
    ports:
      - "3001:80"
    volumes:
      - ./nginx/internal-portal.conf:/etc/nginx/conf.d/default.conf:ro

volumes:
  claims_uploads:
```

---

**Step 6 — Validate `.env` is gitignored and Compose file is valid**

```bash
grep -q '^\.env$' .gitignore || echo '.env' >> .gitignore

cd infrastructure
docker compose config   # must exit 0 with no errors
docker compose up postgres redis --wait
docker compose ps       # both must show (healthy)
```

---

**Step 7 — Bring up the full stack**

```bash
docker compose up --build --wait
```

- Wait for all 6 containers to reach `healthy` status before proceeding

---

**Step 8 — Verify seed data**

```bash
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB \
  -c "SELECT email, role FROM users ORDER BY role;"
# Expected: 6 rows — one per role

docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB \
  -c "SELECT claim_number, status, amount_claimed FROM claims ORDER BY claim_number;"
# Expected: CLM-2024-001 SUBMITTED, CLM-2024-002 UNDER_ADJUDICATION, CLM-2024-003 APPROVED
```

---

**Step 9 — API smoke tests**

```bash
# Login as customer
TOKEN=$(curl -s -X POST http://localhost:8001/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"customer@test.com","password":"Test1234!"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Submit a claim
curl -X POST http://localhost:8002/claims \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"policy_number":"POL-12345","incident_date":"2026-06-01","incident_description":"Rear-end collision at intersection","claimed_amount":25000}'
# Expected: claim JSON with status "SUBMITTED"
```

---

**Step 10 — Frontend walkthrough**

1. Open `http://localhost:3000` → login as `customer@test.com / Test1234!` → submit a new claim → confirm it appears in the dashboard
2. Open `http://localhost:3001` → login as `casemanager@test.com / Test1234!` → assign the claim to a surveyor
3. Login as `surveyor@test.com` → start survey → submit assessment
4. Login as `adjuster@test.com` → approve the claim with an amount
5. Switch back to customer portal → confirm claim status now shows `APPROVED`

---

**Step 11 — Security header verification**

```bash
curl -I http://localhost:3000
# Confirm: X-Frame-Options: DENY, X-Content-Type-Options: nosniff,
#          Referrer-Policy: strict-origin-when-cross-origin
```

---

**Step 12 — Run all backend tests**

```bash
cd src/backend/auth-service   && pytest -v    # 10 tests — all pass
cd src/backend/claims-service && pytest -v    # 14 tests — all pass
```

All 24 tests must be green before the POC is considered complete.
