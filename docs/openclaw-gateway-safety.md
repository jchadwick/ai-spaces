# OpenClaw Gateway Safety Contract (AI Spaces Plugin)

This document defines the non-negotiable runtime contract for the AI Spaces OpenClaw plugin.

## Goal

The plugin must **never** destabilize the OpenClaw gateway process.

Under any expected failure (invalid config, network outage, filesystem issues, malformed request, auth failure, internal bug in plugin path), the plugin must:

1. fail closed for security-sensitive operations,
2. degrade capability for non-security operations,
3. surface diagnostics safely,
4. avoid crashing, hanging, or forcing process termination.

## Hard Requirements

### 1) No boundary exceptions

No exception/rejection may cross a gateway-facing plugin boundary:

- plugin import/activation,
- plugin-sdk registration callbacks,
- HTTP route handlers,
- WebSocket upgrade/setup handlers,
- CLI command actions,
- background task callbacks triggered by plugin lifecycle.

If an internal operation fails, the boundary must convert it into:

- controlled HTTP/WS/CLI response, and/or
- degraded plugin status + structured diagnostics.

### 2) No process termination from plugin

Plugin code must never intentionally terminate OpenClaw (`process.exit`, fatal uncaught crash flow, etc.).

### 3) Bounded async behavior (no hangs)

All gateway-facing async paths must be bounded by timeout/cancellation or finite retry logic.

- Startup/registration must not block indefinitely.
- Request/upgrade/prompt paths must not wait unboundedly.
- Background retries must be controlled and non-storming.

### 4) Fail-closed security semantics

When auth/session/config/policy state is invalid or unknown:

- deny access,
- expose no privileged data,
- do not proxy permissively,
- do not continue insecurely.

### 5) In-place hardening only

Do **not** add duplicate public "safe" APIs/endpoints/modules for existing OpenClaw-facing behavior.

Existing boundaries must be rewritten in place to be intrinsically non-fatal.

### 6) Safe diagnostics

Diagnostics must be:

- no-throw,
- bounded size,
- redacted (no token/cookie/auth-header leakage),
- non-recursive (diagnostic failures cannot crash the plugin).

### 7) Contain async/process-level failures

Unhandled rejections, stream errors, emitter errors, and cleanup failures originating in plugin-managed async/background work must be contained and converted to degraded plugin state rather than process instability.

## Failure Behavior Matrix

| Failure Type | Security-sensitive path | Non-security path |
|---|---|---|
| Missing/invalid auth state | Deny request/upgrade | Degrade/disable affected feature |
| Invalid config | Fail closed + mark degraded | Degrade + diagnostics |
| Backend unreachable/timeout | Deny proxying that requires trust | Degrade + retry with bounds |
| Filesystem read/write errors | Deny operation | Return controlled error + partial service |
| Malformed input | Reject with controlled error | Reject with controlled error |
| Internal exception | Catch at boundary, deny/degrade | Catch at boundary, controlled error |

## Verification Requirements

Changes are not complete without proof:

1. module-level failure-injection tests for each boundary,
2. integration tests with fake OpenClaw API harness,
3. assertions that plugin does not call `process.exit`,
4. assertions for no boundary throw/reject/hang,
5. validation against compiled plugin artifact OpenClaw actually loads.

## Ticket Mapping

- `ro-d807` Define gateway-safety contract
- `ro-72bc` No duplicate safe APIs or endpoints
- `ro-d42e` Bound all gateway-facing async operations
- `ro-dc8f` Unhandled async/process error containment
- `ro-40fd` Verify compiled plugin artifact safety
