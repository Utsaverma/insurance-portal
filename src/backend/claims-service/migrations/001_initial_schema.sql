CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE claim_status AS ENUM (
  'SUBMITTED','ASSIGNED','UNDER_SURVEY','SURVEYED',
  'UNDER_ADJUDICATION','APPROVED','REJECTED','PAID'
);

CREATE SEQUENCE IF NOT EXISTS claim_seq START 1 INCREMENT 1;

CREATE TABLE IF NOT EXISTS claims (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_number         VARCHAR(25) NOT NULL UNIQUE,
  customer_id          UUID NOT NULL,
  policy_number        VARCHAR(50) NOT NULL,
  incident_date        DATE NOT NULL,
  incident_description TEXT NOT NULL,
  claimed_amount       NUMERIC(12,2) NOT NULL,
  status               claim_status NOT NULL DEFAULT 'SUBMITTED',
  assigned_to          UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS claim_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id        UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  filename        VARCHAR(255) NOT NULL,
  stored_path     TEXT NOT NULL,
  mime_type       VARCHAR(100) NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  uploaded_by     UUID NOT NULL,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS claim_status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id    UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  from_status VARCHAR(50),
  to_status   VARCHAR(50) NOT NULL,
  changed_by  UUID NOT NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  note        TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id     UUID REFERENCES claims(id) ON DELETE SET NULL,
  recipient_id UUID NOT NULL,
  channel      VARCHAR(50) NOT NULL,
  message      TEXT NOT NULL,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  status       VARCHAR(20) NOT NULL DEFAULT 'stub'
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER claims_updated_at
  BEFORE UPDATE ON claims
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
