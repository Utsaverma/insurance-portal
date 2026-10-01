#!/usr/bin/env bash
# Pre-demo gate. Exercises the demo journey through the portals' nginx (/api), exactly as the browser does,
# and stops with a non-zero exit code at the first unexpected result.
# Run from infrastructure/ after `docker compose up --build --wait`.
# It makes 6 logins, and login is rate-limited to 10 per minute per client, so don't run it in the minute
# before a live demo. It registers its own customer, so the seeded demo customer's claims stay untouched; staff queues will
# show the smoke claims, so reset the data before a demo (docker compose down -v && docker compose up -d --wait).
set -euo pipefail

# Host ports follow the same precedence as docker compose: shell environment, then .env, then defaults.
if [ -f .env ]; then
  while IFS='=' read -r key value; do
    [ -z "${!key:-}" ] && export "$key=$value"
  done < <(grep -E '^(CUSTOMER_PORTAL_PORT|INTERNAL_PORTAL_PORT|AUTH_PORT|CLAIMS_PORT)=' .env || true)
fi
CUSTOMER_PORTAL="http://localhost:${CUSTOMER_PORTAL_PORT:-3000}"
INTERNAL_PORTAL="http://localhost:${INTERNAL_PORTAL_PORT:-3001}"
API="$CUSTOMER_PORTAL/api"
BASE_AUTH="http://localhost:${AUTH_PORT:-8001}"
BASE_CLAIMS="http://localhost:${CLAIMS_PORT:-8002}"

BODY=$(mktemp); FILE=$(mktemp)
trap 'rm -f "$BODY" "$FILE"' EXIT

pass() { echo "   ✓ $*"; }
fail() { echo "   ✗ $*" >&2; exit 1; }
json() { python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print($1)" "$BODY"; }

# expect <status> <description> <curl args...>: run the request and require the given HTTP status.
expect() {
  local want=$1 desc=$2; shift 2
  local got; got=$(curl -s -o "$BODY" -w '%{http_code}' "$@")
  if [ "$got" = "$want" ]; then pass "$desc ($got)"; else fail "$desc: expected $want, got $got: $(head -c 300 "$BODY")"; fi
}
login() {  # prints only the token on stdout, so it can be captured with $(login ...)
  expect 200 "login $1" -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"Test1234!\"}" >&2
  json "d['access_token']"
}
patch_status() {  # patch_status <want> <description> <token> <claim_id> <json body>
  expect "$1" "$2" -X PATCH "$API/claims/$4/status" -H "Authorization: Bearer $3" \
    -H 'Content-Type: application/json' -d "$5"
}
make_pdf() { python3 -c "import os,sys; open(sys.argv[1],'wb').write(b'%PDF-1.4\n' + os.urandom(int(sys.argv[2])))" "$FILE" "$1"; }

echo "=== Seed data ==="
users=$(docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select count(*) from users where email in (
  '"'"'customer@test.com'"'"','"'"'adjuster@test.com'"'"','"'"'surveyor@test.com'"'"',
  '"'"'casemanager@test.com'"'"','"'"'auditor@test.com'"'"','"'"'manager@test.com'"'"')"' | tr -d '[:space:]')
[ "$users" = "6" ] && pass "6 seeded demo users" || fail "expected 6 seeded demo users, found $users"

echo "=== Edge (nginx) ==="
for portal in "$CUSTOMER_PORTAL" "$INTERNAL_PORTAL"; do
  headers=$(curl -sI "$portal/")
  for header in "X-Frame-Options: DENY" "X-Content-Type-Options: nosniff" "Referrer-Policy:" "Content-Security-Policy:"; do
    echo "$headers" | grep -qi "$header" || fail "$portal is missing header $header"
  done
  pass "security headers on $portal"
  type=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' -H 'Accept: text/html' "$portal/claims/00000000-0000-0000-0000-000000000000")
  [[ "$type" == "200 text/html"* ]] && pass "deep link /claims/:id renders the app on $portal" || fail "deep link on $portal returned $type"
done
expect 401 "wrong password is refused" -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"customer@test.com","password":"wrong-password"}'
expect 401 "unauthenticated API call is refused" "$API/claims"

echo "=== Accounts ==="
ALICE=$(login customer@test.com)
CM=$(login casemanager@test.com)
SURVEYOR=$(login surveyor@test.com)
ADJUSTOR=$(login adjuster@test.com)
SMOKE_EMAIL="smoke_$(date +%s)_$RANDOM@test.com"
expect 201 "register a smoke-test customer" -X POST "$API/auth/register" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SMOKE_EMAIL\",\"password\":\"Test1234!\",\"full_name\":\"Smoke Test\"}"
expect 200 "login smoke-test customer" -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SMOKE_EMAIL\",\"password\":\"Test1234!\"}"
CUSTOMER=$(json "d['access_token']")
REFRESH=$(json "d['refresh_token']")
expect 200 "refresh issues a new access token" -X POST "$API/auth/refresh" -H 'Content-Type: application/json' \
  -d "{\"refresh_token\":\"$REFRESH\"}"
[ "$(json "d['access_token']")" != "$CUSTOMER" ] && pass "refreshed token differs" || fail "refresh returned the same token"

echo "=== Claim journey ==="
expect 201 "customer submits a claim" -X POST "$API/claims" -H "Authorization: Bearer $CUSTOMER" \
  -H 'Content-Type: application/json' \
  -d '{"policy_number":"AUTO-900001","incident_date":"2026-09-29","incident_description":"Smoke test: rear bumper cracked in a car park.","claimed_amount":4200}'
CLAIM=$(json "d['id']")
expect 422 "a claim with a blank policy number and a future incident date is refused" -X POST "$API/claims" \
  -H "Authorization: Bearer $CUSTOMER" -H 'Content-Type: application/json' \
  -d '{"policy_number":"  ","incident_date":"2999-01-01","incident_description":"Smoke test: this claim must not be created.","claimed_amount":100}'
expect 422 "an amount the database cannot hold is refused" -X POST "$API/claims" \
  -H "Authorization: Bearer $CUSTOMER" -H 'Content-Type: application/json' \
  -d '{"policy_number":"AUTO-900001","incident_date":"2026-09-29","incident_description":"Smoke test: this claim must not be created.","claimed_amount":99999999999.99}'
expect 200 "history starts at SUBMITTED" "$API/claims/$CLAIM/history" -H "Authorization: Bearer $CUSTOMER"
[ "$(json "d[0]['to_status']")" = "SUBMITTED" ] && pass "first history row is SUBMITTED" || fail "history does not start at SUBMITTED"

make_pdf $((2 * 1024 * 1024))
expect 201 "2 MB photo-sized PDF uploads through nginx" -X POST "$API/claims/$CLAIM/documents" \
  -H "Authorization: Bearer $CUSTOMER" -F "file=@$FILE;filename=police-report.pdf;type=application/pdf"
make_pdf $((11 * 1024 * 1024))
expect 413 "11 MB upload is refused" -X POST "$API/claims/$CLAIM/documents" \
  -H "Authorization: Bearer $CUSTOMER" -F "file=@$FILE;filename=too-big.pdf;type=application/pdf"
python3 -c "import sys; open(sys.argv[1],'wb').write(b'MZ' + bytes(200))" "$FILE"
expect 415 "executable disguised as a PDF is refused" -X POST "$API/claims/$CLAIM/documents" \
  -H "Authorization: Bearer $CUSTOMER" -F "file=@$FILE;filename=invoice.pdf;type=application/pdf"
expect 403 "another customer cannot read the claim" "$API/claims/$CLAIM" -H "Authorization: Bearer $ALICE"

expect 200 "case manager reads the staff directory" "$API/users/all" -H "Authorization: Bearer $CM"
SURVEYOR_ID=$(json "[u['id'] for u in d if u['role'] == 'SURVEYOR'][0]")
ADJUSTOR_ID=$(json "[u['id'] for u in d if u['role'] == 'ADJUSTOR'][0]")
CUSTOMER_ID=$(json "[u['id'] for u in d if u['role'] == 'CUSTOMER'][0]")
expect 400 "a claim cannot be assigned to a customer" -X POST "$API/claims/$CLAIM/assign" \
  -H "Authorization: Bearer $CM" -H 'Content-Type: application/json' -d "{\"assigned_to\":\"$CUSTOMER_ID\"}"
expect 400 "a claim cannot be assigned to an unknown user" -X POST "$API/claims/$CLAIM/assign" \
  -H "Authorization: Bearer $CM" -H 'Content-Type: application/json' -d '{"assigned_to":"00000000-0000-4000-8000-000000000000"}'
expect 200 "case manager assigns the claim to a surveyor" -X POST "$API/claims/$CLAIM/assign" \
  -H "Authorization: Bearer $CM" -H 'Content-Type: application/json' -d "{\"assigned_to\":\"$SURVEYOR_ID\"}"
[ "$(json "d['status']")" = "ASSIGNED" ] && pass "claim is ASSIGNED" || fail "claim not ASSIGNED after assignment"
expect 200 "surveyor reads the claim" "$API/claims/$CLAIM" -H "Authorization: Bearer $SURVEYOR"
[ "$(json "d['allowed_actions']['transitions']")" = "['UNDER_SURVEY']" ] && pass "the server offers the surveyor only the next step" \
  || fail "surveyor offered $(json "d['allowed_actions']")"

patch_status 200 "surveyor starts the survey" "$SURVEYOR" "$CLAIM" '{"status":"UNDER_SURVEY"}'
patch_status 400 "survey cannot complete without an assessed amount" "$SURVEYOR" "$CLAIM" '{"status":"SURVEYED","note":"Bumper replacement"}'
patch_status 200 "surveyor completes the survey with an assessed amount" "$SURVEYOR" "$CLAIM" \
  '{"status":"SURVEYED","note":"Bumper replacement","assessed_amount":3900}'
[ "$(json "d['assigned_to']")" = "None" ] && pass "a surveyed claim waits unassigned in the adjudication queue" \
  || fail "surveyed claim still assigned to $(json "d['assigned_to']")"
patch_status 200 "adjustor starts adjudication" "$ADJUSTOR" "$CLAIM" '{"status":"UNDER_ADJUDICATION"}'
[ "$(json "d['assigned_to']")" = "$ADJUSTOR_ID" ] && pass "the adjustor who picked the claim up is its assignee" \
  || fail "claim assigned to $(json "d['assigned_to']") after pickup"
make_pdf 1024
expect 403 "staff cannot add documents to a claim assigned to someone else" -X POST "$API/claims/$CLAIM/documents" \
  -H "Authorization: Bearer $SURVEYOR" -F "file=@$FILE;filename=late-report.pdf;type=application/pdf"
patch_status 400 "approval above the claimed amount is refused" "$ADJUSTOR" "$CLAIM" '{"status":"APPROVED","approved_amount":5000}'
patch_status 200 "adjustor approves an amount" "$ADJUSTOR" "$CLAIM" '{"status":"APPROVED","approved_amount":3650}'
expect 200 "customer reads the decision" "$API/claims/$CLAIM" -H "Authorization: Bearer $CUSTOMER"
[ "$(json "d['status'], d['approved_amount']")" = "APPROVED 3650.00" ] && pass "customer sees APPROVED with 3650.00" \
  || fail "customer sees $(json "d['status'], d['approved_amount']")"
patch_status 400 "an override to the current status is refused" "$CM" "$CLAIM" '{"status":"APPROVED","note":"Lower it","approved_amount":1}'
patch_status 200 "adjustor marks the claim paid" "$ADJUSTOR" "$CLAIM" '{"status":"PAID"}'
patch_status 400 "a paid claim is final" "$CM" "$CLAIM" '{"status":"UNDER_ADJUDICATION","note":"Reopen"}'

expect 201 "customer submits a second claim" -X POST "$API/claims" -H "Authorization: Bearer $CUSTOMER" \
  -H 'Content-Type: application/json' \
  -d '{"policy_number":"AUTO-900001","incident_date":"2026-09-29","incident_description":"Smoke test: duplicate report of the same incident.","claimed_amount":1200}'
SECOND=$(json "d['id']")
patch_status 400 "an override needs a reason" "$CM" "$SECOND" '{"status":"REJECTED"}'
patch_status 400 "no claim is paid without an approved amount" "$CM" "$SECOND" '{"status":"PAID","note":"Pay now"}'
patch_status 200 "case manager overrides with a reason" "$CM" "$SECOND" '{"status":"REJECTED","note":"Duplicate of an existing claim"}'
expect 200 "override is in the audit trail" "$API/claims/$SECOND/history" -H "Authorization: Bearer $CM"
[[ "$(json "d[-1]['note']")" == "Case manager override: "* ]] && pass "history records the override and its reason" \
  || fail "override not recorded: $(json "d[-1]['note']")"
[ "$(json "d[-1]['changed_by_name']")" = "David Case" ] && pass "history names who made the override" \
  || fail "override actor recorded as $(json "d[-1]['changed_by_name']")"
expect 400 "a closed claim cannot be reassigned" -X POST "$API/claims/$SECOND/assign" \
  -H "Authorization: Bearer $CM" -H 'Content-Type: application/json' -d "{\"assigned_to\":\"$SURVEYOR_ID\"}"

echo "=== Reports ==="
expect 200 "case manager reads the claims count" "$API/claims?limit=1" -H "Authorization: Bearer $CM"
TOTAL=$(json "d['total']")
expect 200 "case manager reads the report through the internal portal" "$INTERNAL_PORTAL/api/reports/summary" \
  -H "Authorization: Bearer $CM"
[ "$(json "d['total_claims']")" = "$TOTAL" ] && pass "the report counts every claim ($TOTAL)" \
  || fail "the report counts $(json "d['total_claims']") of $TOTAL claims"
expect 403 "reports are not open to surveyors" "$INTERNAL_PORTAL/api/reports/summary" -H "Authorization: Bearer $SURVEYOR"

echo "=== Health ==="
expect 200 "auth-service health" "$BASE_AUTH/health"
expect 200 "claims-service health" "$BASE_CLAIMS/health"
[ "$(json "d['status']")" = "ok" ] && pass "claims-service reports db and redis ok" || fail "claims-service health: $(cat "$BODY")"
policy=$(json "d['workflow_policy']")
if [ "$policy" = "db" ]; then
  pass "workflow rules come from the database (FR3)"
else
  echo "   ! workflow rules come from: $policy. A database created before the FR3 tables keeps the rules in code;"
  echo "     reset it (docker compose down -v && docker compose up -d --wait) to seed them."
fi

echo ""
echo "=== Smoke test PASSED ==="
echo ""
echo "Open in browser:"
echo "  Customer Portal : $CUSTOMER_PORTAL  (customer@test.com / Test1234!)"
echo "  Internal Portal : $INTERNAL_PORTAL  (casemanager@test.com / Test1234!)"
