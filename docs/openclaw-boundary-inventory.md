# OpenClaw-Facing Boundary Inventory (AI Spaces Plugin)

This inventory tracks every known plugin boundary that OpenClaw imports, invokes, or executes directly/indirectly. Each boundary must be hardened in-place and covered by tests.

> Source root: `packages/plugin/src`

## Boundary Inventory

| Boundary ID | Module / Function | Boundary Type | Failure Risk | Hardening Ticket(s) | Test Ticket(s) |
|---|---|---|---|---|---|
| B-01 | `index.ts` default export (channel plugin entry) | Import/activation | Top-level throw breaks plugin load | `ro-4ce2`, `ro-98b5`, `ro-626e` | `ro-ddde`, `ro-40fd` |
| B-02 | `index.ts::registerFull(api)` | Lifecycle callback | Throw/reject/hang during registration | `ro-6224`, `ro-d42e` | `ro-ddde` |
| B-03 | `config.ts` module evaluation | Import config parse | Top-level throw on invalid env | `ro-626e` | `ro-240f`, `ro-ddde` |
| B-04 | `registration.ts` public registration API | Startup/runtime registration | Throw + retry storms + invalid state | `ro-d4f4`, `ro-d42e` | `ro-240f`, `ro-ddde` |
| B-05 | `preflight.ts::runPluginPreflightChecks` | Startup preflight | Throw aborts startup | `ro-c42c` | `ro-240f` |
| B-06 | `routes/space-ws.ts::startSpacesServer` | Local HTTP/WS startup | Listen/config/upgrade failures | `ro-84a0`, `ro-d42e` | `ro-240f`, `ro-ddde` |
| B-07 | `routes/space-ws.ts` request handlers (`/api/spaces`, `/api/health`) | HTTP request handling | Throw/leak/unauth exposure | `ro-84a0`, `ro-d807` | `ro-240f`, `ro-ddde` |
| B-08 | `routes/proxy.ts::proxyRequest` | Proxy boundary | Throw, partial writes, open proxy behavior | `ro-4bf8`, `ro-d807` | `ro-240f`, `ro-ddde` |
| B-09 | `space-store.ts::{listSpaces,getSpace}` | Data lookup boundary | scan exceptions poison all lookups | `ro-a812` | `ro-240f` |
| B-10 | `space-watcher.ts::SpaceWatcher` lifecycle | Background watcher | Event-loop errors/rejections | `ro-0010`, `ro-dc8f` | `ro-240f`, `ro-ddde` |
| B-11 | `routes/acp-ws.ts::handleAcpUpgrade` | WS upgrade boundary | Throw in upgrade/auth/session checks | `ro-ca3a` | `ro-240f`, `ro-ddde` |
| B-12 | `routes/acp-ws.ts::setupAcpConnection` | ACP session setup | stream/agent errors leak outward | `ro-ca3a`, `ro-dc8f` | `ro-240f`, `ro-ddde` |
| B-13 | `acp/agent.ts` ACP method handlers | Prompt/workspace RPC | throw/reject from prompt/filesystem paths | `ro-b8ba`, `ro-cee4` | `ro-240f`, `ro-ddde` |
| B-14 | `acp/openclaw-client.ts` prompt forwarding/subprocess connect | External process/network | throw/hang/parse errors | `ro-b8ba`, `ro-d42e`, `ro-dc8f` | `ro-240f` |
| B-15 | `index.ts` registered HTTP routes | Gateway HTTP callbacks | auth/config failures break gateway callbacks | `ro-6224`, `ro-cee4`, `ro-d807` | `ro-ddde` |
| B-16 | `index.ts` registered CLI actions (`spaces *`) | CLI callback boundary | throw rejects action/runtime | `ro-cee4` | `ro-240f` |
| B-17 | Setup/channel/runtime hooks (`setup-entry.ts`, `channel.ts`, `runtime.ts`) | Plugin-sdk callback boundaries | throw at setup/runtime handoff | `ro-cee4`, `ro-4ce2` | `ro-ddde`, `ro-40fd` |
| B-18 | Shutdown/teardown handlers (watchers/timers/sockets) | Lifecycle shutdown | hang/throw on cleanup | `ro-1294`, `ro-dc8f` | `ro-240f`, `ro-ddde` |

## Change Rule

When a new OpenClaw-facing boundary is added, the same PR must:

1. add it to this inventory,
2. map it to a hardening ticket,
3. map it to boundary tests.

## Definition of Done for Inventory Ticket (`ro-f891`)

- All current boundaries represented in this file.
- Every row has at least one hardening ticket and one test ticket.
- Any future boundary additions update this file in the same PR.
