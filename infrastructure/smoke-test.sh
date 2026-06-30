#!/usr/bin/env bash
# Smoke test — run after `docker compose up --build --wait`
set -euo pipefail

BASE_AUTH=http://localhost:8001
BASE_CLAIMS=http://localhost:8002

echo "=== Verifying seed data ==="
docker compose exec -T postgres psql -U eclaims -d eclaims \
  -c "SELECT email, role FROM users ORDER BY role;"

docker compose exec -T postgres psql -U eclaims -d eclaims \
  -c "SELECT claim_number, status, amount_claimed FROM claims ORDER BY claim_number;"

echo ""
echo "=== API smoke tests ==="

echo "1. Login as customer..."
TOKEN=$(curl -sf -X POST "$BASE_AUTH/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"customer@test.com","password":"Test1234!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
echo "   access_token obtained (${#TOKEN} chars)"

echo "2. GET /users/me..."
curl -sf "$BASE_AUTH/users/me" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'   {d[\"email\"]} role={d[\"role\"]}')"

echo "3. Submit a claim..."
CLAIM=$(curl -sf -X POST "$BASE_CLAIMS/claims" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"policy_number":"POL-SMOKE","incident_date":"2026-06-01","incident_description":"Smoke test rear-end collision at intersection","claimed_amount":25000}')
CLAIM_ID=$(echo "$CLAIM" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
CLAIM_NUM=$(echo "$CLAIM" | python3 -c "import sys,json; print(json.load(sys.stdin)['claim_number'])")
echo "   Created $CLAIM_NUM (id=$CLAIM_ID)"

echo "4. Security headers check..."
HEADERS=$(curl -sI http://localhost:3000)
for header in "X-Frame-Options: DENY" "X-Content-Type-Options: nosniff" "Referrer-Policy:"; do
  if echo "$HEADERS" | grep -qi "$header"; then
    echo "   ✓ $header"
  else
    echo "   ✗ MISSING: $header" >&2
  fi
done

echo ""
echo "=== Health checks ==="
echo "auth-service:   $(curl -sf $BASE_AUTH/health)"
echo "claims-service: $(curl -sf $BASE_CLAIMS/health)"

echo ""
echo "=== Smoke test PASSED ==="
echo ""
echo "Open in browser:"
echo "  Customer Portal : http://localhost:3000  (customer@test.com / Test1234!)"
echo "  Internal Portal : http://localhost:3001  (casemanager@test.com / Test1234!)"
