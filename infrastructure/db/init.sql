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
  claimed_amount       NUMERIC(12,2) NOT NULL CHECK (claimed_amount > 0),
  -- Set by the surveyor (SURVEYED) and the adjustor (APPROVED); an approval never exceeds the claim.
  assessed_amount      NUMERIC(12,2) CHECK (assessed_amount > 0),
  approved_amount      NUMERIC(12,2) CHECK (approved_amount > 0 AND approved_amount <= claimed_amount),
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
-- Six auto claims, one per key status. Every history step is taken by the role the workflow allows, and
-- timestamps are backdated so the reports show realistic processing times. Runs once, on an empty database.

DO $$
DECLARE
  customer UUID := (SELECT id FROM users WHERE email = 'customer@test.com');
  cm       UUID := (SELECT id FROM users WHERE email = 'casemanager@test.com');
  surveyor UUID := (SELECT id FROM users WHERE email = 'surveyor@test.com');
  adjustor UUID := (SELECT id FROM users WHERE email = 'adjuster@test.com');
  c        UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM claims) THEN
    RETURN;
  END IF;

  -- 1. SUBMITTED: waiting for a case manager.
  INSERT INTO claims (claim_number, customer_id, policy_number, status, claimed_amount,
                      incident_date, incident_description, created_at, updated_at)
  VALUES ('CLM-20260928-00001', customer, 'AUTO-100245', 'SUBMITTED', 3450.00, '2026-09-26',
          'Rear-ended at a traffic light on I-95 in Stamford, CT. Rear bumper, trunk lid and both tail lights damaged. Police report filed at the scene.',
          '2026-09-28 09:12+00', '2026-09-28 09:12+00')
  RETURNING id INTO c;
  INSERT INTO claim_status_history (claim_id, changed_by, from_status, to_status, note, changed_at) VALUES
    (c, customer, NULL, 'SUBMITTED', 'Claim submitted', '2026-09-28 09:12+00');

  -- 2. UNDER_SURVEY: the surveyor is inspecting the vehicle.
  INSERT INTO claims (claim_number, customer_id, policy_number, status, claimed_amount, assigned_to,
                      incident_date, incident_description, created_at, updated_at)
  VALUES ('CLM-20260921-00002', customer, 'AUTO-100245', 'UNDER_SURVEY', 5200.00, surveyor, '2026-09-19',
          'Side-swiped by a delivery van in a parking garage in Boston, MA. Both driver-side doors dented and the wing mirror broken.',
          '2026-09-21 14:05+00', '2026-09-23 10:00+00')
  RETURNING id INTO c;
  INSERT INTO claim_status_history (claim_id, changed_by, from_status, to_status, note, changed_at) VALUES
    (c, customer, NULL,        'SUBMITTED',    'Claim submitted',                           '2026-09-21 14:05+00'),
    (c, cm,       'SUBMITTED', 'ASSIGNED',     'Assigned to Carol Surveyor',                '2026-09-22 09:30+00'),
    (c, surveyor, 'ASSIGNED',  'UNDER_SURVEY', 'Inspection booked at the partner workshop', '2026-09-23 10:00+00');

  -- 3. UNDER_ADJUDICATION: survey complete, the adjustor is checking cover.
  INSERT INTO claims (claim_number, customer_id, policy_number, status, claimed_amount, assessed_amount, assigned_to,
                      incident_date, incident_description, created_at, updated_at)
  VALUES ('CLM-20260910-00003', customer, 'AUTO-100245', 'UNDER_ADJUDICATION', 8900.00, 7850.00, surveyor, '2026-09-08',
          'Hail storm in Dallas, TX. Dents across the roof and hood; windshield cracked.',
          '2026-09-10 11:20+00', '2026-09-18 15:40+00')
  RETURNING id INTO c;
  INSERT INTO claim_status_history (claim_id, changed_by, from_status, to_status, note, changed_at) VALUES
    (c, customer, NULL,           'SUBMITTED',          'Claim submitted',                                   '2026-09-10 11:20+00'),
    (c, cm,       'SUBMITTED',    'ASSIGNED',           'Assigned to Carol Surveyor',                        '2026-09-11 09:00+00'),
    (c, surveyor, 'ASSIGNED',     'UNDER_SURVEY',       'Vehicle inspected on site',                         '2026-09-12 13:00+00'),
    (c, surveyor, 'UNDER_SURVEY', 'SURVEYED',           'Paintless dent repair on roof and hood; new windshield. Estimate $7,850.', '2026-09-15 16:30+00'),
    (c, adjustor, 'SURVEYED',     'UNDER_ADJUDICATION', 'Checking comprehensive cover and deductible',       '2026-09-18 15:40+00');

  -- 4. APPROVED: approved after the deductible, awaiting payment.
  INSERT INTO claims (claim_number, customer_id, policy_number, status, claimed_amount, assessed_amount, approved_amount,
                      assigned_to, incident_date, incident_description, created_at, updated_at)
  VALUES ('CLM-20260818-00004', customer, 'AUTO-100245', 'APPROVED', 6400.00, 6100.00, 5850.00, surveyor, '2026-08-16',
          'Struck a deer on a rural highway near Albany, NY. Front grille, hood and radiator damaged; vehicle towed.',
          '2026-08-18 08:45+00', '2026-09-01 12:10+00')
  RETURNING id INTO c;
  INSERT INTO claim_status_history (claim_id, changed_by, from_status, to_status, note, changed_at) VALUES
    (c, customer, NULL,                 'SUBMITTED',          'Claim submitted',                                             '2026-08-18 08:45+00'),
    (c, cm,       'SUBMITTED',          'ASSIGNED',           'Assigned to Carol Surveyor',                                  '2026-08-18 15:00+00'),
    (c, surveyor, 'ASSIGNED',           'UNDER_SURVEY',       'Vehicle inspected at the partner workshop',                   '2026-08-20 10:00+00'),
    (c, surveyor, 'UNDER_SURVEY',       'SURVEYED',           'Front-end repair and radiator replacement. Estimate $6,100.', '2026-08-24 17:20+00'),
    (c, adjustor, 'SURVEYED',           'UNDER_ADJUDICATION', 'Reviewing the survey against collision cover',                '2026-08-27 09:10+00'),
    (c, adjustor, 'UNDER_ADJUDICATION', 'APPROVED',           'Approved at $5,850 after the $250 deductible',                '2026-09-01 12:10+00');

  -- 5. REJECTED: an excluded peril; used to demonstrate a case-manager override.
  INSERT INTO claims (claim_number, customer_id, policy_number, status, claimed_amount, assessed_amount, assigned_to,
                      incident_date, incident_description, created_at, updated_at)
  VALUES ('CLM-20260725-00005', customer, 'AUTO-100245', 'REJECTED', 12000.00, 9800.00, surveyor, '2026-07-22',
          'Engine failed after driving through flood water in Houston, TX. Vehicle towed to a partner workshop.',
          '2026-07-25 10:00+00', '2026-08-11 16:45+00')
  RETURNING id INTO c;
  INSERT INTO claim_status_history (claim_id, changed_by, from_status, to_status, note, changed_at) VALUES
    (c, customer, NULL,                 'SUBMITTED',          'Claim submitted',                                                     '2026-07-25 10:00+00'),
    (c, cm,       'SUBMITTED',          'ASSIGNED',           'Assigned to Carol Surveyor',                                          '2026-07-26 09:15+00'),
    (c, surveyor, 'ASSIGNED',           'UNDER_SURVEY',       'Vehicle inspected at the partner workshop',                           '2026-07-28 11:00+00'),
    (c, surveyor, 'UNDER_SURVEY',       'SURVEYED',           'Water ingress in the engine; replacement recommended. Estimate $9,800.', '2026-08-01 15:30+00'),
    (c, adjustor, 'SURVEYED',           'UNDER_ADJUDICATION', 'Checking flood cover',                                                '2026-08-04 10:20+00'),
    (c, adjustor, 'UNDER_ADJUDICATION', 'REJECTED',           'Flood damage requires comprehensive cover, which is not on this policy', '2026-08-11 16:45+00');

  -- 6. PAID: settled electronically with the partner workshop.
  INSERT INTO claims (claim_number, customer_id, policy_number, status, claimed_amount, assessed_amount, approved_amount,
                      assigned_to, incident_date, incident_description, created_at, updated_at)
  VALUES ('CLM-20260706-00006', customer, 'AUTO-100245', 'PAID', 950.00, 900.00, 900.00, surveyor, '2026-07-04',
          'Windshield cracked by road debris on I-80 near Reno, NV.',
          '2026-07-06 16:30+00', '2026-07-20 11:00+00')
  RETURNING id INTO c;
  INSERT INTO claim_status_history (claim_id, changed_by, from_status, to_status, note, changed_at) VALUES
    (c, customer, NULL,                 'SUBMITTED',          'Claim submitted',                                  '2026-07-06 16:30+00'),
    (c, cm,       'SUBMITTED',          'ASSIGNED',           'Assigned to Carol Surveyor',                       '2026-07-07 09:00+00'),
    (c, surveyor, 'ASSIGNED',           'UNDER_SURVEY',       'Photos reviewed remotely',                         '2026-07-08 10:30+00'),
    (c, surveyor, 'UNDER_SURVEY',       'SURVEYED',           'Windshield replacement. Estimate $900.',           '2026-07-08 12:00+00'),
    (c, adjustor, 'SURVEYED',           'UNDER_ADJUDICATION', 'Checking glass cover',                             '2026-07-10 09:45+00'),
    (c, adjustor, 'UNDER_ADJUDICATION', 'APPROVED',           'Approved in full; glass cover has no deductible',  '2026-07-13 14:20+00'),
    (c, adjustor, 'APPROVED',           'PAID',               'Paid to the partner workshop',                     '2026-07-20 11:00+00');
END $$;
