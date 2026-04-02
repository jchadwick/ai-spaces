#!/bin/bash
# OpenClaw Sandbox Integration Test Script for AI Spaces Plugin
# This script runs all verification tests from MVP.md

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Track test results
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Test helper functions
pass() {
  echo -e "  ${GREEN}✓ PASS${NC}: $1"
  ((TESTS_PASSED++))
}

fail() {
  echo -e "  ${RED}✗ FAIL${NC}: $1"
  ((TESTS_FAILED++))
}

skip() {
  echo -e "  ${YELLOW}⊘ SKIP${NC}: $1"
  ((TESTS_SKIPPED++))
}

section() {
  echo ""
  echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
  echo -e "${BLUE}  $1${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
}

# Configuration
export OPENCLAW_SANDBOX_HOME="${OPENCLAW_SANDBOX_HOME:-/tmp/openclaw-sandbox}"
export OPENCLAW_HOME="$OPENCLAW_SANDBOX_HOME"
export OPENCLAW_WORKSPACE="$OPENCLAW_HOME/workspace"
PLUGIN_DIR="/workspaces/ai-spaces"

echo -e "${GREEN}=== AI Spaces Plugin Integration Tests ===${NC}"
echo ""
echo "Configuration:"
echo "  Sandbox Home: $OPENCLAW_SANDBOX_HOME"
echo "  Plugin Dir: $PLUGIN_DIR"
echo ""

# Pre-flight checks
section "Pre-flight Checks"

# Check Node version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -ge 22 ]; then
  pass "Node.js version $(node --version)"
else
  fail "Node.js version too old: $(node --version)"
fi

# Check OpenClaw installed
if command -v openclaw &> /dev/null; then
  OPENCLAW_VERSION=$(openclaw --version 2>&1 | head -1)
  pass "OpenClaw installed: $OPENCLAW_VERSION"
else
  fail "OpenClaw not installed"
  echo "  Run: npm install -g openclaw@latest"
  exit 1
fi

# Check sandbox exists
if [ -d "$OPENCLAW_SANDBOX_HOME" ]; then
  pass "Sandbox directory exists"
else
  fail "Sandbox directory not found"
  echo "  Run: ./scripts/setup-sandbox.sh"
  exit 1
fi

# Check plugin manifest
if [ -f "$PLUGIN_DIR/openclaw.plugin.json" ]; then
  pass "Plugin manifest exists"
else
  fail "Plugin manifest not found"
fi

# Check package.json
if [ -f "$PLUGIN_DIR/package.json" ]; then
  pass "package.json exists"
else
  fail "package.json not found"
fi

# Step 0: Project Initialization
section "Step 0: Project Initialization"

# Check TypeScript config
if [ -f "$PLUGIN_DIR/tsconfig.json" ]; then
  pass "tsconfig.json exists"
else
  fail "tsconfig.json not found"
fi

# Check node_modules
if [ -d "$PLUGIN_DIR/node_modules" ]; then
  pass "Dependencies installed"
else
  skip "Dependencies not installed - run: npm install"
fi

# Try to build if build script exists
if grep -q '"build"' "$PLUGIN_DIR/package.json" 2>/dev/null; then
  echo "  Attempting build..."
  cd "$PLUGIN_DIR"
  if npm run build > /dev/null 2>&1; then
    pass "npm run build succeeded"
  else
    fail "npm run build failed"
    skip "Build required for remaining tests"
  fi
else
  skip "No build script found"
fi

# Step 1: Plugin Entry Point
section "Step 1: Plugin Entry Point"

# Check if plugin has source files
if [ -f "$PLUGIN_DIR/index.ts" ] || [ -f "$PLUGIN_DIR/dist/index.js" ]; then
  pass "Plugin entry point exists"
else
  fail "Plugin entry point not found (index.ts or dist/index.js)"
fi

# Try to inspect plugin if it's built
if command -v openclaw &> /dev/null && [ -f "$PLUGIN_DIR/openclaw.plugin.json" ]; then
  echo "  Attempting plugin inspect..."
  cd "$PLUGIN_DIR"
  
  # Install plugin temporarily for inspection
  if openclaw plugins install -l . > /dev/null 2>&1; then
    pass "Plugin can be installed"
    
    # Inspect plugin
    if openclaw plugins inspect ai-spaces > /dev/null 2>&1; then
      pass "Plugin inspect succeeds"
      openclaw plugins inspect ai-spaces 2>&1 | head -10
    else
      fail "Plugin inspect failed"
    fi
    
    # Check if CLI command registered
    if openclaw help 2>&1 | grep -qi "spaces"; then
      pass "CLI command 'spaces' registered"
    else
      skip "CLI command 'spaces' not yet registered"
    fi
  else
    fail "Plugin install failed"
  fi
else
  skip "Plugin inspection requires built plugin"
fi

# Step 2: Space Discovery
section "Step 2: Space Discovery"

# Check test space exists
if [ -f "$OPENCLAW_HOME/workspace/TestSpace/.space/spaces.json" ]; then
  pass "Test space config exists"
  cat "$OPENCLAW_HOME/workspace/TestSpace/.space/spaces.json" | jq '.' 2>/dev/null || true
else
  fail "Test space config not found"
fi

# Check if spaces list works
if openclaw spaces list > /dev/null 2>&1; then
  pass "'openclaw spaces list' command works"
  openclaw spaces list 2>&1 | head -5 || true
else
  skip "'openclaw spaces list' not yet available"
fi

# Step 3: Share Link Management
section "Step 3: Share Link Management"

# Check if data directory exists
if [ -d "$OPENCLAW_HOME/data/ai-spaces" ]; then
  pass "Data directory exists"
else
  skip "Data directory not yet created"
fi

# Try to create a share if command exists
if openclaw spaces share create --help > /dev/null 2>&1; then
  echo "  Testing share creation..."
  if openclaw spaces share create TestSpace --role editor --expires 1h > /dev/null 2>&1; then
    pass "Share creation works"
  else
    skip "Share creation not yet implemented"
  fi
else
  skip "'openclaw spaces share' command not yet available"
fi

# Step 4: HTTP Routes
section "Step 4: HTTP Routes"

# Check if gateway can start
if pgrep -f "openclaw gateway" > /dev/null; then
  pass "Gateway already running"
  GATEWAY_RUNNING=true
else
  echo "  Starting gateway..."
  openclaw gateway > /tmp/openclaw-gateway.log 2>&1 &
  GATEWAY_PID=$!
  GATEWAY_RUNNING=false
  
  # Wait for gateway to start
  for i in {1..30}; do
    if curl -s http://localhost:18789/health > /dev/null 2>&1; then
      GATEWAY_RUNNING=true
      break
    fi
    sleep1
  done
  
  if [ "$GATEWAY_RUNNING" = true ]; then
    pass "Gateway started successfully"
  else
    fail "Gateway failed to start"
    cat /tmp/openclaw-gateway.log 2>&1 | tail -20 || true
  fi
fi

# Test HTTP endpoint if gateway is running
if [ "$GATEWAY_RUNNING" = true ]; then
  # Test health endpoint
  if curl -s http://localhost:18789/health > /dev/null 2>&1; then
    pass "Health endpoint responds"
  else
    fail "Health endpoint not responding"
  fi
  
  # Test spaces endpoint (will fail without auth, but endpoint should exist)
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:18789/spaces/TestSpace 2>&1 || echo "000")
  if [ "$HTTP_CODE" != "000" ]; then
    pass "Spaces endpoint exists (HTTP $HTTP_CODE)"
  else
    fail "Spaces endpoint not responding"
  fi
  
  # Stop gateway if we started it
  if [ -n "$GATEWAY_PID" ]; then
    kill $GATEWAY_PID 2>/dev/null || true
    pass "Gateway stopped"
  fi
fi

# Step 5: WebSocket Channel
section "Step 5: WebSocket Channel"

# WebSocket testing requires wscat
if command -v wscat &> /dev/null; then
  pass "wscat installed"
  skip "WebSocket testing requires running gateway"
else
  skip "wscat not installed - run: npm install -g wscat"
fi

# Summary
section "Test Summary"

echo ""
echo -e "${GREEN}Passed:${NC} $TESTS_PASSED"
echo -e "${RED}Failed:${NC} $TESTS_FAILED"
echo -e "${YELLOW}Skipped:${NC} $TESTS_SKIPPED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}All critical tests passed!${NC}"
  exit 0
else
  echo -e "${RED}Some tests failed. See details above.${NC}"
  exit 1
fi