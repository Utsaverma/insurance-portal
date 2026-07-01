#!/usr/bin/env bash
# Smoke test — run after `docker compose up --build --wait`
set -euo pipefail

BASE_AUTH=http://localhost:8001
BASE_CLAIMS=http://localhost:8002

echo "=== Verifying seed data ==="
docker compose exec -T postgres psql -U eclaims -d eclaims \
  -c "SELECT email, role FROM users ORDER BY role;"

docker compose exec -T postgres psql -U eclaims -d eclaims \
  -c "SELECT claim_number, status, claimed_amount FROM claims ORDER BY claim_number;"

echo ""
echo "=== API smoke tests ==="

echo "1. Login as customer..."
LOGIN_RESP=$(curl -sf -X POST "$BASE_AUTH/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"customer@test.com","password":"Test1234!"}')
TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
REFRESH_TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['refresh_token'])")
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

echo "4. POST /auth/register (new user)..."
TS=$(date +%s)
REG=$(curl -sf -X POST "$BASE_AUTH/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"smoketest_${TS}@test.com\",\"password\":\"Test1234!\",\"full_name\":\"Smoke Tester\"}")
echo "$REG" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'   registered {d[\"email\"]}')"

echo "5. POST /auth/refresh..."
NEW_TOKEN=$(curl -sf -X POST "$BASE_AUTH/auth/refresh" \
  -H 'Content-Type: application/json' \
  -d "{\"refresh_token\":\"$REFRESH_TOKEN\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
echo "   new access_token obtained (${#NEW_TOKEN} chars)"
TOKEN=$NEW_TOKEN

echo "6. PATCH /users/me..."
UPDATED=$(curl -sf -X PATCH "$BASE_AUTH/users/me" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"full_name":"Customer Updated"}')
echo "$UPDATED" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'   full_name={d[\"full_name\"]}')"

echo "7. GET /users/all (as case manager)..."
CM_TOKEN=$(curl -sf -X POST "$BASE_AUTH/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"casemanager@test.com","password":"Test1234!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
curl -sf "$BASE_AUTH/users/all" \
  -H "Authorization: Bearer $CM_TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'   {len(d)} users returned')"

echo "8. GET /claims (list)..."
curl -sf "$BASE_CLAIMS/claims" \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'   total={d[\"total\"]} items={len(d[\"items\"])}')"

echo "9. GET /claims/{claim_id}..."
FETCHED=$(curl -sf "$BASE_CLAIMS/claims/$CLAIM_ID" \
  -H "Authorization: Bearer $TOKEN")
echo "$FETCHED" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'   {d[\"claim_number\"]} status={d[\"status\"]}')"

echo "10. PATCH /claims/{claim_id}/status (SUBMITTED -> ASSIGNED)..."
STATUS_RESP=$(curl -sf -X PATCH "$BASE_CLAIMS/claims/$CLAIM_ID/status" \
  -H "Authorization: Bearer $CM_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"ASSIGNED","note":"Smoke test status transition"}')
echo "$STATUS_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'   status={d[\"status\"]}')"

echo "11. GET /claims/{claim_id}/history..."
HISTORY=$(curl -sf "$BASE_CLAIMS/claims/$CLAIM_ID/history" \
  -H "Authorization: Bearer $TOKEN")
echo "$HISTORY" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'   {len(d)} history entr(ies)')"

echo "12. POST /claims/{claim_id}/documents (upload PDF)..."
TMPFILE=$(mktemp /tmp/smoketest_XXXXXX.pdf)
printf '%%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 3 3]>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%%%EOF\n' > "$TMPFILE"
DOC_RESP=$(curl -sf -X POST "$BASE_CLAIMS/claims/$CLAIM_ID/documents" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$TMPFILE;type=application/pdf")
rm -f "$TMPFILE"
DOC_ID=$(echo "$DOC_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "   uploaded doc id=$DOC_ID"

echo "13. GET /claims/{claim_id}/documents..."
DOCS=$(curl -sf "$BASE_CLAIMS/claims/$CLAIM_ID/documents" \
  -H "Authorization: Bearer $TOKEN")
echo "$DOCS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'   {len(d)} document(s) listed')"

echo "14. GET /claims/{claim_id}/documents/{doc_id}/download..."
curl -sf "$BASE_CLAIMS/claims/$CLAIM_ID/documents/$DOC_ID/download" \
  -H "Authorization: Bearer $TOKEN" \
  -o /dev/null
echo "   download OK"

echo "15. Security headers check..."
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
