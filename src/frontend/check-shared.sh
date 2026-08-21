#!/usr/bin/env bash
# Verifies the design-system files that must stay byte-identical between
# customer-portal and internal-portal actually are — see README.md's "Shared
# design tokens" section for why the duplication exists in the first place.
set -euo pipefail

cd "$(dirname "$0")"

CUSTOMER=customer-portal
INTERNAL=internal-portal

# Must be byte-identical across both portals.
SHARED_FILES=(
  tailwind.config.js
  src/index.css
  public/theme-init.js
  public/favicon.svg
  src/components/ui/Alert.tsx
  src/components/ui/Avatar.tsx
  src/components/ui/Badge.tsx
  src/components/ui/Button.tsx
  src/components/ui/Card.tsx
  src/components/ui/Feedback.tsx
  src/components/ui/Field.tsx
  src/components/ui/IconButton.tsx
  src/components/ui/Input.tsx
  src/components/ui/Logo.tsx
  src/components/ui/Page.tsx
  src/components/ui/StatCard.tsx
  src/components/layout/AppShell.tsx
  src/components/layout/Header.tsx
  src/components/layout/MobileNav.tsx
  src/components/layout/ThemeToggle.tsx
  src/components/layout/UserMenu.tsx
  src/context/ThemeContext.tsx
  src/lib/cn.ts
  src/lib/initials.ts
  src/lib/theme.ts
  src/lib/format.ts
  src/components/DocumentList.tsx
)

# Expected to differ, with the reason:
#   nav.ts             - wordmark + nav items are per-portal
#   layout/shell.ts     - content width is deliberately different per portal
#   pages/Login.tsx     - copy differs (brand tagline, portal name)
#   index.html          - title/description differ
#   main.tsx            - provider nesting differs (internal's AuthContext calls useNavigate)
#   ui/index.ts          - internal re-exports Table, which customer doesn't have
#   ClaimStatusBadge.tsx - one import path differs (api/claims.ts vs types/index.ts)
#   lib/user.ts          - role fallback differs (CUSTOMER vs AUDITOR)

status=0
for f in "${SHARED_FILES[@]}"; do
  if [ ! -f "$CUSTOMER/$f" ] || [ ! -f "$INTERNAL/$f" ]; then
    echo "MISSING: $f (expected in both portals)"
    status=1
    continue
  fi
  if ! diff -q "$CUSTOMER/$f" "$INTERNAL/$f" > /dev/null; then
    echo "DRIFT: $f differs between $CUSTOMER and $INTERNAL"
    diff "$CUSTOMER/$f" "$INTERNAL/$f" || true
    status=1
  fi
done

if [ "$status" -eq 0 ]; then
  echo "check-shared.sh: OK — all shared files are byte-identical."
fi
exit $status
