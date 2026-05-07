# WebSocket Keepalive Design

**Date:** 2026-05-07  
**Status:** Draft — awaiting approval  

## Problem

Voxa's signaling WebSocket has no keepalive mechanism. When a mobile client backgrounds the browser (especially Android Chrome), the OS can silently drop the TCP connection. Without keepalive:

- The server never detects dead connections — `ClientContext` entries accumulate indefinitely
- The client doesn't know the connection is dead until it tries to send a message
- Reconnect only happens reactively, causing multi-second gaps in signaling

## Goals

1. Detect silent disconnections within ~30 seconds (not minutes)
2. Clean up dead peer state server-side so rooms don't accumulate ghost peers
3. Trigger fast client reconnect when the keepalive fails
4. Add zero overhead to normal message flow

## Non-Goals

- Prevent Android from killing the connection (impossible from web code)
- Change reconnection UI/UX behavior
- Modify transport-level retry logic

## Design

### Client (`web/src/signaling/client.ts`)

**Ping behavior:**
- After `socket.onopen`, start a `setInterval` timer (15s)
- Send `{ type: 'ping' }` on each tick
- Reset a 30s timeout on every incoming message (any server message counts as "alive")
- If the 30s timeout fires, treat the connection as dead:
  - Call `socket.close()` to trigger the existing `onclose` → reconnect flow

**Cleanup:**
- Clear ping interval and timeout in `disconnect()`, `flushAndDisconnect()`, and when `socket.onclose` fires
- Guard against stale socket references (same pattern as existing `this.ws !== socket` checks)

**Constants:**
- `PING_INTERVAL_MS = 15000`
- `PONG_TIMEOUT_MS = 30000`

### Server (`server/src/signaling/server.ts`)

**Idle timeout:**
- Track `lastActivityAt` timestamp on each `ClientContext`
- Update `lastActivityAt` on every incoming message (including pings)
- Start a `setInterval` (5s) to check all clients
- If `now - lastActivityAt > 60000`, close the WebSocket with code `1001`
- On `ws.on('close')`, existing cleanup runs (broadcast `peer_left`, delete `ClientContext`, etc.)

**Constants:**
- `IDLE_TIMEOUT_MS = 60000`
- `IDLE_CHECK_INTERVAL_MS = 5000`

### Message Protocol

No new server message type needed. The server doesn't explicitly respond to `ping` — any message (including normal broadcasts) resets the client's timeout. This avoids extra traffic.

If we later want explicit `pong`, we can add `{ type: 'pong' }`, but it's unnecessary for this design.

## Trade-offs

| Approach | Pros | Cons |
|---|---|---|
| **This design: application-level ping + idle timeout** | Works across all browsers/OS; easy to test; no ws-library internals needed | Slightly more traffic (~4 bytes every 15s) |
| Native `ws.ping()` / `ws.pong()` frames | Slightly lower overhead; handled by ws library | Harder to test with mock WebSocket; doesn't solve idle detection as cleanly |

**Recommended:** Application-level ping for testability and clarity. The overhead is negligible.

## Testing Strategy

- **Client tests** (`web/tests/signaling/client.test.ts`):
  - Mock `setInterval`/`setTimeout` via Vitest `vi.useFakeTimers()`
  - Assert ping is sent every 15s
  - Assert no reconnect happens while messages arrive within 30s
  - Assert `socket.close()` is called when 30s passes with no message
  - Assert timers are cleared on `disconnect()`

- **Server tests** (`server/tests/signaling/server.test.ts`):
  - Connect a client, wait 5s, assert still open
  - Connect a client, don't send any message for 60s, assert server closes connection
  - Connect a client, send a ping every 15s, assert still open after 60s

## Files Changed

- `web/src/signaling/client.ts` — add ping interval, pong timeout, cleanup
- `server/src/signaling/server.ts` — add `lastActivityAt`, idle check interval
- `web/tests/signaling/client.test.ts` — keepalive tests
- `server/tests/signaling/server.test.ts` — idle timeout tests

## Acceptance Criteria

- [ ] Client sends `ping` every 15s while connected
- [ ] Client reconnects if no server message for 30s
- [ ] Server closes connection if no client message for 60s
- [ ] All existing tests still pass
- [ ] New keepalive tests pass
