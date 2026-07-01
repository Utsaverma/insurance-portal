CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── SEQUENCES ─────────────────────────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS claim_seq START 1;

-- ─── ENUM TYPES ────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE claim_status AS ENUM (
    'SUBMITTED','ASSIGNED','UNDER_SURVEY','SURVEYED',
    'UNDER_ADJUDICATION','APPROVED','REJECTED','PAID'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_number         TEXT UNIQUE NOT NULL,
  customer_id          UUID NOT NULL REFERENCES users(id),
  policy_number        TEXT NOT NULL,
  status               claim_status NOT NULL DEFAULT 'SUBMITTED',
  claimed_amount       NUMERIC(12,2) NOT NULL,
  incident_description TEXT NOT NULL,
  assigned_to          UUID REFERENCES users(id),
  incident_date        DATE NOT NULL,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS claim_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id        UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  uploaded_by     UUID NOT NULL REFERENCES users(id),
  filename        TEXT NOT NULL,
  stored_path     TEXT NOT NULL,
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
  note        TEXT,
  changed_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  claim_id     UUID REFERENCES claims(id) ON DELETE SET NULL,
  message      TEXT NOT NULL,
  channel      TEXT NOT NULL DEFAULT 'in-app',
  status       TEXT NOT NULL DEFAULT 'stub',
  sent_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── INDEXES ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_claims_customer_id        ON claims(customer_id);
CREATE INDEX IF NOT EXISTS idx_claims_status             ON claims(status);
CREATE INDEX IF NOT EXISTS idx_claim_status_history_cid  ON claim_status_history(claim_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient   ON notifications(recipient_id);

-- ─── SEED USERS ────────────────────────────────────────────────────────────
-- Password for all seed users: Test1234!
-- Hash verified to match "Test1234!" via: python3 -c "import bcrypt; print(bcrypt.checkpw(b'Test1234!', b'<hash>'))"

INSERT INTO users (email, password_hash, role, full_name) VALUES
  ('customer@test.com',    '$2b$12$MQc.r.vjwWnNNoeuXPUKX.7cGyesThA6CZLnWnPA8vxFTpUHH7moW', 'CUSTOMER',         'Alice Customer'),
  ('adjuster@test.com',    '$2b$12$MQc.r.vjwWnNNoeuXPUKX.7cGyesThA6CZLnWnPA8vxFTpUHH7moW', 'ADJUSTOR',         'Bob Adjuster'),
  ('surveyor@test.com',    '$2b$12$MQc.r.vjwWnNNoeuXPUKX.7cGyesThA6CZLnWnPA8vxFTpUHH7moW', 'SURVEYOR',         'Carol Surveyor'),
  ('casemanager@test.com', '$2b$12$MQc.r.vjwWnNNoeuXPUKX.7cGyesThA6CZLnWnPA8vxFTpUHH7moW', 'CASE_MANAGER',     'David Case'),
  ('auditor@test.com',     '$2b$12$MQc.r.vjwWnNNoeuXPUKX.7cGyesThA6CZLnWnPA8vxFTpUHH7moW', 'AUDITOR',          'Eve Auditor'),
  ('manager@test.com',     '$2b$12$MQc.r.vjwWnNNoeuXPUKX.7cGyesThA6CZLnWnPA8vxFTpUHH7moW', 'REGIONAL_MANAGER', 'Frank Manager')
ON CONFLICT (email) DO NOTHING;

-- ─── SEED CLAIMS ───────────────────────────────────────────────────────────

WITH usr AS (
  SELECT id, email FROM users
  WHERE email IN (
    'customer@test.com','adjuster@test.com','surveyor@test.com'
  )
)
INSERT INTO claims
  (claim_number, customer_id, policy_number, status, claimed_amount,
   assigned_to, incident_date, incident_description)
VALUES
  ('CLM-2024-001',
   (SELECT id FROM usr WHERE email='customer@test.com'),
   'POL-001','SUBMITTED',15000.00,NULL,
   '2024-11-15','Hospitalisation claim for surgery'),
  ('CLM-2024-002',
   (SELECT id FROM usr WHERE email='customer@test.com'),
   'POL-002','UNDER_ADJUDICATION',45000.00,
   (SELECT id FROM usr WHERE email='adjuster@test.com'),
   '2024-10-22','Rear-end collision on highway'),
  ('CLM-2024-003',
   (SELECT id FROM usr WHERE email='customer@test.com'),
   'POL-003','APPROVED',120000.00,
   (SELECT id FROM usr WHERE email='adjuster@test.com'),
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
INSERT INTO claim_status_history (claim_id, changed_by, from_status, to_status, note)
VALUES
  ((SELECT id FROM cls WHERE claim_number='CLM-2024-001'),
   (SELECT id FROM usr WHERE email='casemanager@test.com'),
   NULL, 'SUBMITTED', 'Claim submitted by customer'),
  ((SELECT id FROM cls WHERE claim_number='CLM-2024-002'),
   (SELECT id FROM usr WHERE email='casemanager@test.com'),
   NULL, 'SUBMITTED', 'Claim submitted'),
  ((SELECT id FROM cls WHERE claim_number='CLM-2024-002'),
   (SELECT id FROM usr WHERE email='adjuster@test.com'),
   'SUBMITTED', 'UNDER_ADJUDICATION', 'Moved to adjudication'),
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
