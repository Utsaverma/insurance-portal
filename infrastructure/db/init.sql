CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── TABLES ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN (
                  'CUSTOMER','ADJUSTOR','SURVEYOR',
                  'CASE_MANAGER','AUDITOR','REGIONAL_MANAGER')),
  full_name     TEXT NOT NULL,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS claims (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_number          TEXT UNIQUE NOT NULL,
  customer_id           UUID NOT NULL REFERENCES users(id),
  policy_number         TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'SUBMITTED'
                          CHECK (status IN (
                            'SUBMITTED','ASSIGNED','UNDER_SURVEY','SURVEYED',
                            'UNDER_ADJUDICATION','APPROVED','REJECTED','PAID')),
  amount_claimed        NUMERIC(12,2) NOT NULL,
  amount_approved       NUMERIC(12,2),
  description           TEXT,
  assigned_adjuster_id  UUID REFERENCES users(id),
  assigned_surveyor_id  UUID REFERENCES users(id),
  incident_date         DATE NOT NULL,
  submitted_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS claim_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id        UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  uploaded_by     UUID NOT NULL REFERENCES users(id),
  file_name       TEXT NOT NULL,
  file_path       TEXT NOT NULL,
  file_size_bytes BIGINT,
  mime_type       TEXT,
  uploaded_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS claim_status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id    UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  changed_by  UUID NOT NULL REFERENCES users(id),
  from_status TEXT,
  to_status   TEXT NOT NULL,
  notes       TEXT,
  changed_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  claim_id   UUID REFERENCES claims(id) ON DELETE SET NULL,
  message    TEXT NOT NULL,
  is_read    BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── INDEXES ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_claims_customer_id        ON claims(customer_id);
CREATE INDEX IF NOT EXISTS idx_claims_status             ON claims(status);
CREATE INDEX IF NOT EXISTS idx_claim_status_history_cid  ON claim_status_history(claim_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read   ON notifications(user_id, is_read);

-- ─── SEED USERS ────────────────────────────────────────────────────────────
-- Password for all seed users: Test1234!
-- bcrypt hash generated with: python -c "import bcrypt; print(bcrypt.hashpw(b'Test1234!', bcrypt.gensalt(12)).decode())"
-- Using a pre-generated hash (cost 12) for idempotent seeding:

INSERT INTO users (email, password_hash, role, full_name) VALUES
  ('customer@test.com',    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj7ihFyAI.e2', 'CUSTOMER',         'Alice Customer'),
  ('adjuster@test.com',    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj7ihFyAI.e2', 'ADJUSTOR',         'Bob Adjuster'),
  ('surveyor@test.com',    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj7ihFyAI.e2', 'SURVEYOR',         'Carol Surveyor'),
  ('casemanager@test.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj7ihFyAI.e2', 'CASE_MANAGER',     'David Case'),
  ('auditor@test.com',     '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj7ihFyAI.e2', 'AUDITOR',          'Eve Auditor'),
  ('manager@test.com',     '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj7ihFyAI.e2', 'REGIONAL_MANAGER', 'Frank Manager')
ON CONFLICT (email) DO NOTHING;

-- ─── SEED CLAIMS ───────────────────────────────────────────────────────────

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

-- ─── SEED STATUS HISTORY ───────────────────────────────────────────────────

WITH usr AS (
  SELECT id, email FROM users
  WHERE email IN ('casemanager@test.com','adjuster@test.com','surveyor@test.com')
),
cls AS (
  SELECT id, claim_number FROM claims
  WHERE claim_number IN ('CLM-2024-001','CLM-2024-002','CLM-2024-003')
)
INSERT INTO claim_status_history (claim_id, changed_by, from_status, to_status, notes)
VALUES
  -- CLM-2024-001: 1 row
  ((SELECT id FROM cls WHERE claim_number='CLM-2024-001'),
   (SELECT id FROM usr WHERE email='casemanager@test.com'),
   NULL, 'SUBMITTED', 'Claim submitted by customer'),
  -- CLM-2024-002: 2 rows
  ((SELECT id FROM cls WHERE claim_number='CLM-2024-002'),
   (SELECT id FROM usr WHERE email='casemanager@test.com'),
   NULL, 'SUBMITTED', 'Claim submitted'),
  ((SELECT id FROM cls WHERE claim_number='CLM-2024-002'),
   (SELECT id FROM usr WHERE email='adjuster@test.com'),
   'SUBMITTED', 'UNDER_ADJUDICATION', 'Moved to adjudication'),
  -- CLM-2024-003: 4 rows
  ((SELECT id FROM cls WHERE claim_number='CLM-2024-003'),
   (SELECT id FROM usr WHERE email='casemanager@test.com'),
   NULL, 'SUBMITTED', 'Claim submitted'),
  ((SELECT id FROM cls WHERE claim_number='CLM-2024-003'),
   (SELECT id FROM usr WHERE email='surveyor@test.com'),
   'SUBMITTED', 'UNDER_SURVEY', 'Survey started'),
  ((SELECT id FROM cls WHERE claim_number='CLM-2024-003'),
   (SELECT id FROM usr WHERE email='surveyor@test.com'),
   'UNDER_SURVEY', 'SURVEYED', 'Survey completed'),
  ((SELECT id FROM cls WHERE claim_number='CLM-2024-003'),
   (SELECT id FROM usr WHERE email='adjuster@test.com'),
   'SURVEYED', 'APPROVED', 'Approved with deduction for pre-existing damage');
