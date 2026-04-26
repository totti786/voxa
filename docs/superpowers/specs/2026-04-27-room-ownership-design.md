# Room Ownership Design Spec

**Date:** 2026-04-27
**Scope:** Voxa voice app — server + web client

---

## 1. Goal

Add room ownership so that the creator of a room has admin powers: kick peers and force-mute peers. Ownership automatically transfers to the longest-tenured peer when the owner leaves. Kicked peers receive a 5-minute ban from that room.

---

## 2. Data Model Changes

### `server/src/room/state.ts`

```typescript
export interface Peer {
  id: string;
  displayName: string;
  muted: boolean;
  forceMuted: boolean;        // NEW: set by owner, blocks self-unmute
  wsId: string;
  joinedAt: Date;             // NEW: for ownership transfer
  sendTransport?: WebRtcTransport;
  recvTransport?: WebRtcTransport;
  producer?: Producer;
  consumers: Map<string, Consumer>;
  rtpCapabilities?: RtpCapabilities;
}

export interface Room {
  id: string;
  password?: string;
  maxUsers: number;
  peers: Map<string, Peer>;
  createdAt: Date;
  ownerPeerId: string | null; // NEW
  bannedUntil: Map<string, number>; // NEW: peerId → timestamp (ms)
}
```

**New helper methods on `RoomState`:**
- `setOwner(roomId, peerId): boolean`
- `getLongestTenurePeer(roomId): Peer | undefined` — returns peer with oldest `joinedAt`
- `banPeer(roomId, peerId, durationMs): void`
- `isBanned(roomId, peerId): boolean`
- `clearForceMutedFlags(roomId): void` — clears `forceMuted` on all peers (called on ownership transfer)

### Shared types (`server/src/types.ts` + `web/src/types.ts`)

```typescript
export interface PeerInfo {
  id: string;
  display_name: string;
  muted: boolean;
  speaking: boolean;
  is_owner: boolean;      // NEW
  force_muted: boolean;   // NEW
}

// Client → Server
export interface KickPeerMessage extends SignalingMessage {
  type: 'kick_peer';
  peer_id: string;
}

export interface ForceMuteMessage extends SignalingMessage {
  type: 'force_mute';
  peer_id: string;
  muted: boolean;
}

// Server → Client
export interface PeerForceMutedMessage extends SignalingMessage {
  type: 'peer_force_muted';
  peer_id: string;
  muted: boolean;
}

export interface OwnershipChangedMessage extends SignalingMessage {
  type: 'ownership_changed';
  owner_id: string;
}

export interface KickedMessage extends SignalingMessage {
  type: 'kicked';
  reason: string;
}
```

---

## 3. Server Logic

### Owner Assignment
- On room creation (HTTP POST `/rooms` or first WS `join` for a non-existent room), set `ownerPeerId` to the creating peer's ID.
- When a peer joins an existing room, they are a regular member.

### Ownership Transfer
- On owner disconnect or `leave` message:
  1. Find peer with oldest `joinedAt` via `getLongestTenurePeer()`.
  2. Set that peer as new owner via `setOwner()`.
  3. Call `clearForceMutedFlags()` to reset all force-mutes.
  4. Broadcast `ownership_changed { owner_id }` to remaining peers.
  5. If no peers remain, delete the room as usual.

### Kick
- On `kick_peer { peer_id }`:
  1. Validate sender is owner.
  2. Validate target peer exists in room.
  3. Call `banPeer(roomId, peer_id, 5 * 60 * 1000)`.
  4. Force-close target's websocket.
  5. The peer's disconnect handler will clean up their state and broadcast `peer_left`.

### Ban Enforcement
- On `join` message:
  1. If room exists and `isBanned(roomId, peerId)` is true, send `error { message: 'You are banned from this room' }` and abort join.
  2. Otherwise proceed with normal join flow.

### Force Mute
- On `force_mute { peer_id, muted }`:
  1. Validate sender is owner.
  2. Update target peer: `peer.muted = muted`, `peer.forceMuted = muted`.
  3. If `muted === false`, also clear `forceMuted`.
  4. Broadcast `peer_force_muted { peer_id, muted }` to all room peers.
  5. If `muted === true` and target has an active producer, pause it server-side (optional but good practice).

### Self-Mute Rejection
- On `mute { muted }` from a peer:
  1. If `peer.forceMuted === true` and `muted === false`, reject the unmute attempt.
  2. Send `error { message: 'You have been force-muted by the room owner' }` back to the peer.
  3. Do not update state or broadcast.

---

## 4. Client Logic & UI

### State
- Add `localIsOwner: boolean` to `AppState`.
- `PeerInfo` already gains `is_owner` and `force_muted` from shared types.

### Message Handlers
- **`joined`**: iterate peers, set `localIsOwner = peer.id === localPeerId && peer.is_owner`.
- **`peer_joined` / `peer_left`**: update list; refresh crown icon placement.
- **`ownership_changed`**: update `localIsOwner`; update `is_owner` flag on all peers.
- **`peer_force_muted`**: update target peer's `muted` and `force_muted`.
- **`kicked`**: show alert "You have been kicked from the room", call `disconnect()`, return to lobby.

### UI — Owner Crown
- In `participants.ts`, if `peer.is_owner`, append a `👑` crown icon to the orb via `::after` or a small absolute-positioned span.
- CSS: small crown in top-right corner of the orb.

### UI — Admin Actions (owner only)
- In `participants.ts`, when rendering peer orbs, if `localIsOwner` and peer is not self:
  - Add hover-reveal action buttons: 🔇 mute and 👢 kick.
  - Mute button: click sends `force_mute { peer_id, muted: true }`.
  - Kick button: click shows `confirm('Kick ${peer.display_name} from the room?')`, then sends `kick_peer { peer_id }`.

### UI — Force-Mute Lock
- In `controls.ts` (local mic button):
  - If `force_muted` is true, show a 🔒 lock overlay on the mic icon.
  - Tooltip: "Muted by room owner".
  - `onclick` is disabled (no-op or shows toast).
- In `participants.ts` (peer orbs):
  - If `peer.force_muted`, show a small 🔒 icon near the muted indicator.

---

## 5. Error Handling

- Non-owner sends `kick_peer` or `force_mute` → server replies `error { message: 'Only the room owner can do that' }`.
- Target peer doesn't exist → `error { message: 'Peer not found' }`.
- Banned peer tries to join → `error { message: 'You are banned from this room' }`.
- Force-muted peer tries to self-unmute → `error { message: 'You have been force-muted by the room owner' }`.

---

## 6. Testing Strategy

**Server integration tests:**
1. First peer to join becomes owner.
2. Second peer joins, first peer is still owner.
3. Owner leaves → ownership transfers to second peer.
4. Owner kicks peer → peer is banned for 5 min, receives `kicked` message, websocket closes.
5. Banned peer tries to rejoin → receives error, not allowed in.
6. Non-owner tries to kick → receives error, no action taken.
7. Owner force-mutes peer → peer's `forceMuted` is true, self-unmute is rejected.
8. Ownership transfer clears all `forceMuted` flags.

**Client integration tests:**
1. `joined` message with `is_owner: true` sets `localIsOwner`.
2. `ownership_changed` updates `localIsOwner` correctly.
3. `peer_force_muted` updates peer state in store.
4. `kicked` triggers disconnect and alert.

---

## 7. Files to Modify

- `server/src/room/state.ts` — data model + helpers
- `server/src/types.ts` — message types
- `server/src/signaling/server.ts` — message handlers
- `server/src/signaling/protocol.ts` — validation for new messages
- `web/src/types.ts` — message types
- `web/src/app.ts` — state + message handlers
- `web/src/ui/participants.ts` — crown + admin actions
- `web/src/ui/controls.ts` — force-mute lock UI
- `web/tests/integration/app.test.ts` — new tests
- `server/tests/` — new or updated server tests

---

## 8. Open Questions

None. All clarifying questions have been answered.
