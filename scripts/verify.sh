#!/bin/bash

# ============================================
# Local Verification Script
# ============================================
# Run this script before pushing to ensure your changes won't break production.
# Usage: ./scripts/verify.sh or npm run verify

echo ""
echo "============================================"
echo "FieldSync Pre-Push Verification"
echo "============================================"
echo "Running comprehensive checks before push..."
echo ""

# Track results
FAILED=0

# ----------------------------------------
# Check 1: ESLint
# ----------------------------------------
echo "📝 Step 1/4: Checking code quality (ESLint)..."
npm run lint > /tmp/lint-output.txt 2>&1
LINT_EXIT=$?

# Check for actual errors (not warnings)
if grep -q " error " /tmp/lint-output.txt; then
  echo "❌ ESLint found errors:"
  grep " error " /tmp/lint-output.txt | head -10
  FAILED=1
else
  WARN_COUNT=$(grep -c "warning" /tmp/lint-output.txt 2>/dev/null || echo "0")
  echo "✅ ESLint passed ($WARN_COUNT warnings)"
fi

# ----------------------------------------
# Check 2: Unit Tests
# ----------------------------------------
echo ""
echo "🧪 Step 2/4: Running tests..."
npm run test > /tmp/test-output.txt 2>&1
TEST_EXIT=$?

if [ $TEST_EXIT -ne 0 ]; then
  echo "❌ Tests failed:"
  tail -20 /tmp/test-output.txt
  FAILED=1
else
  TEST_COUNT=$(grep -oE "[0-9]+ passed" /tmp/test-output.txt | tail -1)
  echo "✅ Tests passed ($TEST_COUNT)"
fi

# ----------------------------------------
# Check 3: Build
# ----------------------------------------
echo ""
echo "🏗️  Step 3/4: Verifying build..."
npm run build > /tmp/build-output.txt 2>&1
BUILD_EXIT=$?

if [ $BUILD_EXIT -ne 0 ]; then
  echo "❌ Build failed:"
  tail -20 /tmp/build-output.txt
  FAILED=1
else
  if [ -d "dist" ]; then
    DIST_SIZE=$(du -sh dist 2>/dev/null | cut -f1)
    echo "✅ Build successful (size: $DIST_SIZE)"
  else
    echo "✅ Build successful"
  fi
fi

# ----------------------------------------
# Check 4: Security
# ----------------------------------------
echo ""
echo "🔒 Step 4/4: Security check..."

# Check for hardcoded secrets
SECRETS_FOUND=$(grep -rE "api[_-]?key\s*[:=]\s*['\"][a-zA-Z0-9]{20,}" --include="*.js" --include="*.jsx" src/ 2>/dev/null | grep -v placeholder | grep -v example | wc -l | tr -d ' ')
if [ "$SECRETS_FOUND" -gt 0 ]; then
  echo "⚠️  Warning: Potential hardcoded secrets found ($SECRETS_FOUND matches)"
else
  echo "✅ No hardcoded secrets detected"
fi

# ----------------------------------------
# Summary
# ----------------------------------------
echo ""
echo "============================================"
echo "Verification Summary"
echo "============================================"

if [ $FAILED -ne 0 ]; then
  echo ""
  echo "❌ VERIFICATION FAILED"
  echo "Please fix the issues above before pushing."
  exit 1
fi

echo ""
echo "✨ All checks passed! Safe to push."
echo ""
echo "To commit and push:"
echo "  git add ."
echo "  git commit -m \"Your message\""
echo "  git push"
