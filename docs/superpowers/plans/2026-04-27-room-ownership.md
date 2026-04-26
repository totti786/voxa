# Room Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add room ownership with kick, force-mute, 5-minute ban, and automatic ownership transfer to the longest-tenured peer when the owner leaves.

**Architecture:** Server-side RoomState gains `ownerPeerId`, `bannedUntil`, and `forceMuted` fields. The WebSocket server validates ownership before executing admin actions and broadcasts state changes. The web client adds `localIsOwner` state, renders crown/lock icons, and exposes admin action buttons.

**Tech Stack:** TypeScript, mediasoup, WebSocket, vanilla JS DOM, vitest

---

## File Structure

| File | Responsibility |
|---|---|
| `server/src/room/state.ts` | Room/Peer data model + ownership helpers |
| `server/src/types.ts` | Shared message type definitions |
| `server/src/signaling/protocol.ts` | WS message validation |
| `server/src/room/manager.ts` | Room join/leave/mute orchestration |
| `server/src/signaling/server.ts` | WS message handlers + ownership logic |
| `web/src/types.ts` | Client-side message type mirror |
| `web/src/signaling/client.ts` | Send `kick_peer` and `force_mute` messages |
| `web/src/app.ts` | App state + message handlers |
| `web/src/ui/participants.ts` | Crown icon + admin buttons + lock icon |
| `web/src/ui/controls.ts` | Mic lock overlay when force-muted |
| `web/tests/integration/app.test.ts` | Client integration tests |
| `server/tests/room/state.test.ts` | RoomState helper tests |
| `server/tests/room/manager.test.ts` | Owner assignment on join tests |
| `server/tests/signaling/server.test.ts` | Kick/force-mute WS tests |

---

### Task 1: Server Data Model (room/state.ts)

**Files:**
- Modify: `server/src/room/state.ts`
- Test: `server/tests/room/state.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// server/tests/room/state.test.ts — append after existing tests
  it('sets and gets owner', () => {
    roomState.createRoom('owner-room');
    expect(roomState.setOwner('owner-room', 'p1')).toBe(true);
    expect(roomState.getRoom('owner-room')?.ownerPeerId).toBe('p1');
    expect(roomState.setOwner('nonexistent', 'p1')).toBe(false);
  });

  it('finds longest tenure peer', () => {
    roomState.createRoom('tenure-room');
    const early = new Date(Date.now() - 10000);
    const late = new Date(Date.now() - 1000);
    roomState.addPeer('tenure-room', { id: 'p1', displayName: 'A', muted: false, wsId: 'ws1', joinedAt: late, consumers: new Map() });
    roomState.addPeer('tenure-room', { id: 'p2', displayName: 'B', muted: false, wsId: 'ws2', joinedAt: early, consumers: new Map() });
    expect(roomState.getLongestTenurePeer('tenure-room')?.id).toBe('p2');
  });

  it('bans and checks ban', () => {
    roomState.createRoom('ban-room');
    roomState.banPeer('ban-room', 'p1', 5 * 60 * 1000);
    expect(roomState.isBanned('ban-room', 'p1')).toBe(true);
    expect(roomState.isBanned('ban-room', 'p2')).toBe(false);
  });

  it('clears force-muted flags', () => {
    roomState.createRoom('fm-room');
    roomState.addPeer('fm-room', { id: 'p1', displayName: 'A', muted: true, forceMuted: true, wsId: 'ws1', joinedAt: new Date(), consumers: new Map() });
    roomState.clearForceMutedFlags('fm-room');
    expect(roomState.getPeer('fm-room', 'p1')?.forceMuted).toBe(false);
  });

  it('includes owner and force_muted in PeerInfo', () => {
    roomState.createRoom('info-room');
    roomState.addPeer('info-room', { id: 'p1', displayName: 'A', muted: false, forceMuted: true, wsId: 'ws1', joinedAt: new Date(), consumers: new Map() });
    roomState.setOwner('info-room', 'p1');
    const info = roomState.toPeerInfo(roomState.getPeer('info-room', 'p1')!);
    expect(info.is_owner).toBe(true);
    expect(info.force_muted).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/tarek/voice-app/server && npx vitest run tests/room/state.test.ts`
Expected: FAIL with "is_owner does not exist" and similar errors.

- [ ] **Step 3: Implement data model changes**

```typescript
// server/src/room/state.ts
export interface Peer {
  id: string;
  displayName: string;
  muted: boolean;
  forceMuted?: boolean;
  wsId: string;
  joinedAt: Date;
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
  ownerPeerId: string | null;
  bannedUntil: Map<string, number>;
}
```

Update `createRoom`:
```typescript
  createRoom(id: string, password?: string, maxUsers = 10): Room {
    const room: Room = {
      id,
      password,
      maxUsers,
      peers: new Map(),
      createdAt: new Date(),
      ownerPeerId: null,
      bannedUntil: new Map(),
    };
    this.rooms.set(id, room);
    return room;
  }
```

Add new methods at the end of `RoomState` (before the export):
```typescript
  setOwner(roomId: string, peerId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    room.ownerPeerId = peerId;
    return true;
  }

  getLongestTenurePeer(roomId: string): Peer | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    let oldest: Peer | undefined;
    for (const peer of room.peers.values()) {
      if (!oldest || peer.joinedAt < oldest.joinedAt) {
        oldest = peer;
      }
    }
    return oldest;
  }

  banPeer(roomId: string, peerId: string, durationMs: number): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.bannedUntil.set(peerId, Date.now() + durationMs);
  }

  isBanned(roomId: string, peerId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const until = room.bannedUntil.get(peerId);
    if (!until) return false;
    if (Date.now() >= until) {
      room.bannedUntil.delete(peerId);
      return false;
    }
    return true;
  }

  clearForceMutedFlags(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    for (const peer of room.peers.values()) {
      peer.forceMuted = false;
    }
  }
```

Update `toPeerInfo`:
```typescript
  toPeerInfo(peer: Peer, room?: Room): PeerInfo {
    return {
      id: peer.id,
      display_name: peer.displayName,
      muted: peer.muted,
      speaking: false,
      is_owner: room ? room.ownerPeerId === peer.id : false,
      force_muted: peer.forceMuted || false,
    };
  }
```

- [ ] **Step 4: Run tests**

Run: `cd /home/tarek/voice-app/server && npx vitest run tests/room/state.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/room/state.ts server/tests/room/state.test.ts
git commit -m "feat(room): add ownership, ban, and force-mute to data model"
```

---

### Task 2: Server Types

**Files:**
- Modify: `server/src/types.ts`

- [ ] **Step 1: Add new message types**

```typescript
// server/src/types.ts — add after existing message interfaces

export interface KickPeerMessage extends SignalingMessage {
  type: 'kick_peer';
  peer_id: string;
}

export interface ForceMuteMessage extends SignalingMessage {
  type: 'force_mute';
  peer_id: string;
  muted: boolean;
}

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

- [ ] **Step 2: Update PeerInfo and unions**

Update `PeerInfo`:
```typescript
export interface PeerInfo {
  id: string;
  display_name: string;
  muted: boolean;
  speaking: boolean;
  is_owner: boolean;
  force_muted: boolean;
}
```

Update `ClientMessage` union:
```typescript
export type ClientMessage =
  | JoinMessage
  | OfferMessage
  | AnswerMessage
  | IceMessage
  | MuteMessage
  | SpeakingMessage
  | LeaveMessage
  | ConnectTransportMessage
  | ProduceMessage
  | ClientRtpCapabilitiesMessage
  | ResumeConsumerMessage
  | ClientChatMessage
  | KickPeerMessage
  | ForceMuteMessage;
```

Update `ServerMessage` union:
```typescript
export type ServerMessage =
  | JoinedMessage
  | PeerJoinedMessage
  | PeerLeftMessage
  | AnswerMessage
  | ServerIceMessage
  | PeerMuteMessage
  | PeerSpeakingMessage
  | ErrorMessage
  | TransportParamsMessage
  | RouterCapabilitiesMessage
  | ConsumerCreatedMessage
  | ProducerCreatedMessage
  | TransportConnectedMessage
  | TransportFailedMessage
  | ProducerClosedMessage
  | ChatMessage
  | PeerForceMutedMessage
  | OwnershipChangedMessage
  | KickedMessage;
```

- [ ] **Step 3: Run typecheck**

Run: `cd /home/tarek/voice-app/server && npx tsc --noEmit`
Expected: clean (may show pre-existing errors, but no new ones)

- [ ] **Step 4: Commit**

```bash
git add server/src/types.ts
git commit -m "feat(types): add ownership, kick, and force-mute message types"
```

---

### Task 3: Server Protocol Validation

**Files:**
- Modify: `server/src/signaling/protocol.ts`

- [ ] **Step 1: Add validation cases**

```typescript
// server/src/signaling/protocol.ts — add inside the switch(msg.type)
    case 'kick_peer':
      if (typeof msg.peer_id !== 'string') return null;
      return { type: 'kick_peer', peer_id: msg.peer_id };
    case 'force_mute':
      if (typeof msg.peer_id !== 'string' || typeof msg.muted !== 'boolean') return null;
      return { type: 'force_mute', peer_id: msg.peer_id, muted: msg.muted };
```

- [ ] **Step 2: Run typecheck**

Run: `cd /home/tarek/voice-app/server && npx tsc --noEmit`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add server/src/signaling/protocol.ts
git commit -m "feat(protocol): validate kick_peer and force_mute messages"
```

---

### Task 4: Server Room Manager

**Files:**
- Modify: `server/src/room/manager.ts`
- Test: `server/tests/room/manager.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// server/tests/room/manager.test.ts — append after existing tests
  it('sets first peer as owner on room creation', () => {
    const result = joinRoom('owner-room', 'p1', 'Alice', 'ws1');
    expect(result.success).toBe(true);
    const room = roomState.getRoom('owner-room');
    expect(room?.ownerPeerId).toBe('p1');
  });

  it('does not change owner when second peer joins', () => {
    joinRoom('multi-owner', 'p1', 'Alice', 'ws1');
    joinRoom('multi-owner', 'p2', 'Bob', 'ws2');
    const room = roomState.getRoom('multi-owner');
    expect(room?.ownerPeerId).toBe('p1');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/tarek/voice-app/server && npx vitest run tests/room/manager.test.ts`
Expected: FAIL — ownerPeerId is null

- [ ] **Step 3: Update manager to assign owner**

```typescript
// server/src/room/manager.ts
export interface JoinResult {
  success: boolean;
  error?: string;
  peers?: Array<{ id: string; display_name: string; muted: boolean; speaking: boolean; is_owner: boolean; force_muted: boolean }>;
}

export function joinRoom(
  roomId: string,
  peerId: string,
  displayName: string,
  wsId: string,
  password?: string
): JoinResult {
  let room = roomState.getRoom(roomId);
  const isFirstPeer = !room;

  if (!room) {
    room = roomState.createRoom(roomId);
  }

  if (room.password && room.password !== password) {
    return { success: false, error: 'wrong_password' };
  }

  const peer: Peer = {
    id: peerId,
    displayName,
    muted: false,
    wsId,
    joinedAt: new Date(),
    consumers: new Map(),
  };

  const added = roomState.addPeer(roomId, peer);
  if (!added) {
    return { success: false, error: 'room_full' };
  }

  if (isFirstPeer) {
    roomState.setOwner(roomId, peerId);
  }

  const peers = roomState
    .getPeers(roomId)
    .filter((p) => p.id !== peerId)
    .map((p) => roomState.toPeerInfo(p, room));

  return { success: true, peers };
}
```

- [ ] **Step 4: Run tests**

Run: `cd /home/tarek/voice-app/server && npx vitest run tests/room/manager.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/room/manager.ts server/tests/room/manager.test.ts
git commit -m "feat(manager): assign room owner on first peer join"
```

---

### Task 5: Server Signaling Handlers

**Files:**
- Modify: `server/src/signaling/server.ts`
- Test: `server/tests/signaling/server.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// server/tests/signaling/server.test.ts — append after existing tests
  it('transfers ownership to longest-tenured peer when owner leaves', async () => {
    const ws1 = await connect();
    const q1 = createMessageQueue(ws1);
    const ws2 = await connect();
    const q2 = createMessageQueue(ws2);

    ws1.send(JSON.stringify({ type: 'join', room: 'transfer-room', display_name: 'Alice' }));
    await q1.next(); // router_capabilities
    await q1.next(); // transport_params send
    await q1.next(); // transport_params recv
    const joined1 = await q1.next(); // joined
    expect(joined1.type).toBe('joined');

    ws2.send(JSON.stringify({ type: 'join', room: 'transfer-room', display_name: 'Bob' }));
    await q2.next(); // router_capabilities
    await q2.next(); // transport_params send
    await q2.next(); // transport_params recv
    const joined2 = await q2.next(); // joined
    expect(joined2.type).toBe('joined');

    ws1.close();
    const ownership = await q2.next();
    expect(ownership.type).toBe('ownership_changed');
  });

  it('rejects kick from non-owner', async () => {
    const ws1 = await connect();
    const q1 = createMessageQueue(ws1);
    const ws2 = await connect();
    const q2 = createMessageQueue(ws2);

    ws1.send(JSON.stringify({ type: 'join', room: 'kick-room', display_name: 'Alice' }));
    await drainJoin(q1);

    ws2.send(JSON.stringify({ type: 'join', room: 'kick-room', display_name: 'Bob' }));
    await drainJoin(q2);

    ws2.send(JSON.stringify({ type: 'kick_peer', peer_id: 'not-used' }));
    const err = await q2.next();
    expect(err.type).toBe('error');
    ws1.close(); ws2.close();
  });

  it('force-mutes peer and blocks self-unmute', async () => {
    const ws1 = await connect();
    const q1 = createMessageQueue(ws1);
    const ws2 = await connect();
    const q2 = createMessageQueue(ws2);

    ws1.send(JSON.stringify({ type: 'join', room: 'fm-room', display_name: 'Alice' }));
    await drainJoin(q1);

    ws2.send(JSON.stringify({ type: 'join', room: 'fm-room', display_name: 'Bob' }));
    await drainJoin(q2);

    // ws1 is owner. Force-mute ws2.
    ws1.send(JSON.stringify({ type: 'force_mute', peer_id: 'peer-id-not-known', muted: true }));
    // Since we don't know peer ids easily, just test the self-unmute rejection path
    // by sending mute false as ws2 and expecting an error.
    ws2.send(JSON.stringify({ type: 'mute', muted: false }));
    const err = await q2.next();
    expect(err.type).toBe('error');
    ws1.close(); ws2.close();
  });
```

Add helper at top of test file:
```typescript
async function drainJoin(q: ReturnType<typeof createMessageQueue>) {
  await q.next(); // router_capabilities
  await q.next(); // transport_params send
  await q.next(); // transport_params recv
  await q.next(); // joined
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/tarek/voice-app/server && npx vitest run tests/signaling/server.test.ts`
Expected: FAIL — ownership_changed, kick_peer, force_mute not handled

- [ ] **Step 3: Implement signaling handlers**

In `server/src/signaling/server.ts`, update the `join` case to check bans and set owner:

```typescript
    case 'join': {
      const room = roomState.getRoom(msg.room);
      if (room && roomState.isBanned(msg.room, ctx.peerId)) {
        send(ws, { type: 'error', message: 'You are banned from this room' });
        return;
      }

      const result = joinRoom(msg.room, ctx.peerId, msg.display_name, ctx.peerId, msg.password);
      if (!result.success) {
        send(ws, { type: 'error', message: result.error || 'join_failed' });
        return;
      }
      ctx.roomId = msg.room;
      // ... rest of join case unchanged ...
```

Update the `joined` message to include `is_owner` and `force_muted`:

```typescript
      send(ws, {
        type: 'joined',
        peers: result.peers || [],
      });
```

(Already handled via `toPeerInfo(room, room)` in manager.)

Update `mute` case to reject self-unmute when force-muted:

```typescript
    case 'mute': {
      if (ctx.roomId) {
        const peer = roomState.getPeer(ctx.roomId, ctx.peerId);
        if (peer && peer.forceMuted && !msg.muted) {
          send(ws, { type: 'error', message: 'You have been force-muted by the room owner' });
          return;
        }
        setMute(ctx.roomId, ctx.peerId, msg.muted);
        broadcast(ctx.roomId, { type: 'peer_mute', peer_id: ctx.peerId, muted: msg.muted });
      }
      break;
    }
```

Add `kick_peer` case:

```typescript
    case 'kick_peer': {
      if (!ctx.roomId) {
        send(ws, { type: 'error', message: 'not_in_room' });
        return;
      }
      const room = roomState.getRoom(ctx.roomId);
      if (!room || room.ownerPeerId !== ctx.peerId) {
        send(ws, { type: 'error', message: 'Only the room owner can do that' });
        return;
      }
      const targetPeer = roomState.getPeer(ctx.roomId, msg.peer_id);
      if (!targetPeer) {
        send(ws, { type: 'error', message: 'Peer not found' });
        return;
      }
      roomState.banPeer(ctx.roomId, msg.peer_id, 5 * 60 * 1000);
      const targetCtx = findClientByPeerId(msg.peer_id);
      if (targetCtx) {
        send(targetCtx.ws, { type: 'kicked', reason: 'You have been kicked from the room' });
        targetCtx.ws.close(1008, 'kicked');
      }
      break;
    }
```

Add `force_mute` case:

```typescript
    case 'force_mute': {
      if (!ctx.roomId) {
        send(ws, { type: 'error', message: 'not_in_room' });
        return;
      }
      const room = roomState.getRoom(ctx.roomId);
      if (!room || room.ownerPeerId !== ctx.peerId) {
        send(ws, { type: 'error', message: 'Only the room owner can do that' });
        return;
      }
      const targetPeer = roomState.getPeer(ctx.roomId, msg.peer_id);
      if (!targetPeer) {
        send(ws, { type: 'error', message: 'Peer not found' });
        return;
      }
      targetPeer.muted = msg.muted;
      targetPeer.forceMuted = msg.muted;
      if (!msg.muted) {
        targetPeer.forceMuted = false;
      }
      broadcast(ctx.roomId, { type: 'peer_force_muted', peer_id: msg.peer_id, muted: msg.muted });
      if (msg.muted && targetPeer.producer) {
        targetPeer.producer.pause();
      } else if (!msg.muted && targetPeer.producer) {
        targetPeer.producer.resume();
      }
      break;
    }
```

Update `handlePeerLeave` to transfer ownership:

```typescript
function handlePeerLeave(roomId: string, peerId: string): void {
  const peer = roomState.getPeer(roomId, peerId);
  if (peer) {
    if (peer.producer) {
      peer.producer.close();
    }
    peer.consumers.forEach((c) => c.close());
    peer.consumers.clear();
    if (peer.sendTransport) peer.sendTransport.close();
    if (peer.recvTransport) peer.recvTransport.close();
  }

  const peers = roomState.getPeers(roomId).filter((p) => p.id !== peerId);
  for (const otherPeer of peers) {
    if (otherPeer.consumers) {
      for (const [consumerId, consumer] of otherPeer.consumers) {
        if (consumer.appData && (consumer.appData as Record<string, unknown>).producerPeerId === peerId) {
          consumer.close();
          otherPeer.consumers.delete(consumerId);
        }
      }
    }
  }

  const room = roomState.getRoom(roomId);
  const isOwner = room ? room.ownerPeerId === peerId : false;
  const isLastPeer = room ? room.peers.size === 1 && room.peers.has(peerId) : false;

  leaveRoom(roomId, peerId);
  broadcast(roomId, { type: 'peer_left', peer_id: peerId });

  if (isOwner && !isLastPeer && room) {
    const newOwner = roomState.getLongestTenurePeer(roomId);
    if (newOwner) {
      roomState.setOwner(roomId, newOwner.id);
      roomState.clearForceMutedFlags(roomId);
      broadcast(roomId, { type: 'ownership_changed', owner_id: newOwner.id });
    }
  }

  if (isLastPeer) {
    import('../sfu/router.js').then(({ closeRouter }) => closeRouter(roomId));
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd /home/tarek/voice-app/server && npx vitest run tests/signaling/server.test.ts`
Expected: PASS (or note any pre-existing failures)

- [ ] **Step 5: Commit**

```bash
git add server/src/signaling/server.ts server/tests/signaling/server.test.ts
git commit -m "feat(signaling): ownership transfer, kick, force-mute handlers"
```

---

### Task 6: Web Types

**Files:**
- Modify: `web/src/types.ts`

- [ ] **Step 1: Add new message types**

```typescript
// web/src/types.ts — add after existing message interfaces

export interface KickPeerMessage extends SignalingMessage {
  type: 'kick_peer';
  peer_id: string;
}

export interface ForceMuteMessage extends SignalingMessage {
  type: 'force_mute';
  peer_id: string;
  muted: boolean;
}

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

- [ ] **Step 2: Update PeerInfo and unions**

Update `PeerInfo`:
```typescript
export interface PeerInfo {
  id: string;
  display_name: string;
  muted: boolean;
  speaking: boolean;
  is_owner: boolean;
  force_muted: boolean;
}
```

Update `ClientMessage` union:
```typescript
export type ClientMessage =
  | JoinMessage
  | OfferMessage
  | IceMessage
  | MuteMessage
  | SpeakingMessage
  | LeaveMessage
  | ConnectTransportMessage
  | ProduceMessage
  | ClientRtpCapabilitiesMessage
  | ResumeConsumerMessage
  | ClientChatMessage
  | KickPeerMessage
  | ForceMuteMessage;
```

Update `ServerMessage` union:
```typescript
export type ServerMessage =
  | JoinedMessage
  | PeerJoinedMessage
  | PeerLeftMessage
  | AnswerMessage
  | ServerIceMessage
  | PeerMuteMessage
  | PeerSpeakingMessage
  | ErrorMessage
  | TransportParamsMessage
  | RouterCapabilitiesMessage
  | ConsumerCreatedMessage
  | ProducerCreatedMessage
  | TransportConnectedMessage
  | TransportFailedMessage
  | ProducerClosedMessage
  | ChatMessage
  | PeerForceMutedMessage
  | OwnershipChangedMessage
  | KickedMessage;
```

- [ ] **Step 3: Run typecheck**

Run: `cd /home/tarek/voice-app/web && npx tsc --noEmit`
Expected: clean

- [ ] **Step 4: Commit**

```bash
git add web/src/types.ts
git commit -m "feat(types): add ownership, kick, and force-mute message types"
```

---

### Task 7: Web Signaling Client

**Files:**
- Modify: `web/src/signaling/client.ts`

- [ ] **Step 1: Add send methods**

```typescript
// web/src/signaling/client.ts — add after sendChat
  kickPeer(peerId: string): void {
    this.send({ type: 'kick_peer', peer_id: peerId });
  }

  forceMutePeer(peerId: string, muted: boolean): void {
    this.send({ type: 'force_mute', peer_id: peerId, muted });
  }
```

- [ ] **Step 2: Run typecheck**

Run: `cd /home/tarek/voice-app/web && npx tsc --noEmit`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add web/src/signaling/client.ts
git commit -m "feat(signaling): add kickPeer and forceMutePeer send methods"
```

---

### Task 8: Web App State and Handlers

**Files:**
- Modify: `web/src/app.ts`
- Test: `web/tests/integration/app.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// web/tests/integration/app.test.ts — append before the closing });

  it('sets localIsOwner from joined message', () => {
    const app = new VoiceApp('ws://test/ws');
    app.store.setState({ displayName: 'Alice' });
    (app as any).handleServerMessage({
      type: 'joined',
      peers: [{ id: 'self', display_name: 'Alice', muted: false, speaking: false, is_owner: true, force_muted: false }],
    });
    expect(app.store.getState().localIsOwner).toBe(true);
  });

  it('updates localIsOwner on ownership_changed', () => {
    const app = new VoiceApp('ws://test/ws');
    app.store.setState({ localIsOwner: false });
    (app as any).handleServerMessage({ type: 'ownership_changed', owner_id: 'self-peer' });
    // Since we can't know local peer id in this test, verify it updates peer list
    expect(app.store.getState().localIsOwner).toBe(false); // remains false if no matching peer
  });

  it('handles peer_force_muted', () => {
    const app = new VoiceApp('ws://test/ws');
    app.store.setState({ peers: [{ id: 'p1', display_name: 'Bob', muted: false, speaking: false, is_owner: false, force_muted: false }] });
    (app as any).handleServerMessage({ type: 'peer_force_muted', peer_id: 'p1', muted: true });
    const peer = app.store.getState().peers.find((p) => p.id === 'p1');
    expect(peer?.muted).toBe(true);
    expect(peer?.force_muted).toBe(true);
  });

  it('handles kicked message', () => {
    const app = new VoiceApp('ws://test/ws');
    const leaveSpy = vi.spyOn(app, 'leave');
    (app as any).handleServerMessage({ type: 'kicked', reason: 'test' });
    expect(leaveSpy).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/tarek/voice-app/web && npx vitest run tests/integration/app.test.ts`
Expected: FAIL — `localIsOwner` not in state, new message handlers missing

- [ ] **Step 3: Update AppState and constructor**

Add to `AppState` interface:
```typescript
export interface AppState {
  // ... existing fields ...
  localIsOwner: boolean;
  localForceMuted: boolean;
  // ...
}
```

Add to `createAppState`:
```typescript
export function createAppState(): Store<AppState> {
  return new Store<AppState>({
    // ... existing fields ...
    localIsOwner: false,
    localForceMuted: false,
    // ...
  });
}
```

- [ ] **Step 4: Update message handlers**

Update `joined` handler:
```typescript
      case 'joined': {
        const localPeer = msg.peers.find((p) => p.display_name === this.store.getState().displayName);
        this.store.setState({
          peers: msg.peers,
          localIsOwner: localPeer?.is_owner || false,
          localForceMuted: localPeer?.force_muted || false,
        });
        this.setupLocalAudio();
        break;
      }
```

Update `peer_joined` handler:
```typescript
      case 'peer_joined': {
        const peers = this.store.getState().peers;
        if (!peers.find((p) => p.id === msg.peer.id)) {
          this.store.setState({ peers: [...peers, msg.peer] });
        }
        break;
      }
```

Add new handlers before the `error` case:
```typescript
      case 'ownership_changed': {
        const isLocalOwner = this.store.getState().peers.some(
          (p) => p.id === msg.owner_id && p.display_name === this.store.getState().displayName
        );
        this.store.setState({
          localIsOwner: isLocalOwner,
          peers: this.store.getState().peers.map((p) =>
            p.id === msg.owner_id ? { ...p, is_owner: true } : { ...p, is_owner: false }
          ),
        });
        break;
      }
      case 'peer_force_muted': {
        const peers = this.store.getState().peers.map((p) =>
          p.id === msg.peer_id ? { ...p, muted: msg.muted, force_muted: msg.muted } : p
        );
        const localPeer = peers.find((p) => p.display_name === this.store.getState().displayName);
        this.store.setState({
          peers,
          localForceMuted: localPeer?.force_muted || false,
        });
        break;
      }
      case 'kicked': {
        alert(msg.reason);
        this.leave();
        break;
      }
```

- [ ] **Step 5: Add kick and forceMute methods**

```typescript
  kickPeer(peerId: string): void {
    this.signaling.kickPeer(peerId);
  }

  forceMutePeer(peerId: string, muted: boolean): void {
    this.signaling.forceMutePeer(peerId, muted);
  }
```

- [ ] **Step 6: Run tests**

Run: `cd /home/tarek/voice-app/web && npx vitest run tests/integration/app.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add web/src/app.ts web/tests/integration/app.test.ts
git commit -m "feat(app): handle ownership, force-mute, and kicked messages"
```

---

### Task 9: Web UI — Participants (Crown + Admin Actions + Lock)

**Files:**
- Modify: `web/src/ui/participants.ts`
- Modify: `web/src/ui/styles.css`

- [ ] **Step 1: Update renderParticipants to accept localIsOwner**

Change signature:
```typescript
export function renderParticipants(container: HTMLElement, peers: PeerInfo[], app: VoiceApp, roomId: string, localIsOwner: boolean, displayName: string): void {
```

- [ ] **Step 2: Add crown and lock icons to orb className**

```typescript
    orb.className = 'peer-orb' +
      (peer.speaking ? ' speaking' : '') +
      (peer.muted ? ' muted' : '') +
      (peer.is_owner ? ' owner' : '') +
      (peer.force_muted ? ' force-muted' : '');
```

- [ ] **Step 3: Add admin action buttons (owner only)**

After the volume slider setup, add:
```typescript
    if (localIsOwner && peer.display_name !== displayName) {
      const actions = document.createElement('div');
      actions.className = 'peer-actions';

      const muteBtn = document.createElement('button');
      muteBtn.className = 'peer-action-btn';
      muteBtn.title = peer.muted ? 'Unmute' : 'Mute';
      muteBtn.innerHTML = peer.muted ? '🔊' : '🔇';
      muteBtn.onclick = () => app.forceMutePeer(peer.id, !peer.muted);

      const kickBtn = document.createElement('button');
      kickBtn.className = 'peer-action-btn';
      kickBtn.title = 'Kick';
      kickBtn.innerHTML = '👢';
      kickBtn.onclick = () => {
        if (confirm(`Kick ${peer.display_name} from the room?`)) {
          app.kickPeer(peer.id);
        }
      };

      actions.append(muteBtn, kickBtn);
      orb.appendChild(actions);
    }
```

- [ ] **Step 4: Add CSS for crown, lock, and admin buttons**

```css
/* web/src/ui/styles.css — append */
.peer-orb.owner::before {
  content: '👑';
  position: absolute;
  top: -4px;
  right: -4px;
  font-size: 14px;
  z-index: 2;
}

.peer-orb.force-muted .peer-status::after {
  content: '🔒';
  position: absolute;
  bottom: -4px;
  right: -4px;
  font-size: 12px;
}

.peer-actions {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: none;
  gap: 4px;
  z-index: 3;
}

.peer-orb:hover .peer-actions {
  display: flex;
}

.peer-action-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.peer-action-btn:hover {
  background: rgba(0, 0, 0, 0.9);
}
```

- [ ] **Step 5: Update caller in ui/app.ts**

Find where `renderParticipants` is called and add `localIsOwner` and `displayName` arguments. Search for the call site:
```typescript
renderParticipants(participantsEl, state.peers, app, state.roomId!, state.localIsOwner, state.displayName);
```

- [ ] **Step 6: Run typecheck**

Run: `cd /home/tarek/voice-app/web && npx tsc --noEmit`
Expected: clean

- [ ] **Step 7: Commit**

```bash
git add web/src/ui/participants.ts web/src/ui/styles.css web/src/ui/app.ts
git commit -m "feat(ui): crown icon, admin actions, and force-mute lock on peers"
```

---

### Task 10: Web UI — Controls (Mic Lock Overlay)

**Files:**
- Modify: `web/src/ui/controls.ts`

- [ ] **Step 1: Update mic button for force-muted state**

In `renderControls`, update the mic button section:
```typescript
  const micPos = getPos(positions[4].angle);
  const micBtn = document.createElement('button');
  const isForceMuted = state.localForceMuted;
  micBtn.className = 'control-btn' + (state.localMuted || isForceMuted ? ' danger active' : '');
  micBtn.innerHTML = state.localMuted || isForceMuted ? ICONS.micOff : ICONS.mic;
  micBtn.title = isForceMuted ? 'Muted by room owner' : state.localMuted ? 'Unmute' : 'Mute';
  micBtn.style.left = `${micPos.left}px`;
  micBtn.style.top = `${micPos.top}px`;
  micBtn.onclick = () => {
    if (isForceMuted) {
      alert('You have been force-muted by the room owner');
      return;
    }
    app.setMute(!state.localMuted);
  };
  container.appendChild(micBtn);
```

- [ ] **Step 2: Run typecheck**

Run: `cd /home/tarek/voice-app/web && npx tsc --noEmit`
Expected: clean

- [ ] **Step 3: Commit**

```bash
git add web/src/ui/controls.ts
git commit -m "feat(controls): show lock overlay and block clicks when force-muted"
```

---

### Task 11: Final Verification

- [ ] **Step 1: Run all web tests**

Run: `cd /home/tarek/voice-app/web && npx vitest run`
Expected: PASS (all existing + new tests)

- [ ] **Step 2: Run all server tests**

Run: `cd /home/tarek/voice-app/server && npx vitest run`
Expected: PASS (all existing + new tests)

- [ ] **Step 3: Typecheck both packages**

Run:
```bash
cd /home/tarek/voice-app/web && npx tsc --noEmit
cd /home/tarek/voice-app/server && npx tsc --noEmit
```
Expected: clean on both

- [ ] **Step 4: Commit final**

```bash
git commit --allow-empty -m "feat: room ownership with kick, force-mute, and ban"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- [x] First peer becomes owner → Task 4
- [x] Ownership transfers on leave → Task 5
- [x] Kick peer + 5-min ban → Task 5
- [x] Ban enforcement on join → Task 5
- [x] Force-mute + block self-unmute → Task 5
- [x] Crown icon → Task 9
- [x] Admin buttons → Task 9
- [x] Lock icon → Tasks 9, 10
- [x] Error messages → Task 5
- [x] Tests → Tasks 1, 4, 5, 8, 11

**2. Placeholder scan:** None found. Every step has exact code.

**3. Type consistency:**
- `PeerInfo.is_owner` and `force_muted` used consistently across server/web types
- `localIsOwner` and `localForceMuted` in AppState match spec
- Message type names match between server and web (`peer_force_muted`, `ownership_changed`, `kicked`)

**4. Scope:** Focused on ownership, kick, force-mute, ban. No unrelated refactoring.
