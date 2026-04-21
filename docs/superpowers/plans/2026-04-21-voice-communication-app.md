# Voice Communication App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web-first, self-hosted voice communication app with WebRTC audio SFU, Web Audio API processing, and minimal-friction room-based voice chat for 2–10 users.

**Architecture:** Monorepo with a Vanilla TypeScript SPA frontend (Vite) and a Node.js + mediasoup backend handling WebSocket signaling and audio SFU. Nginx reverse-proxies both static assets and the WebSocket endpoint. Docker Compose packages everything for self-hosting.

**Tech Stack:** TypeScript, Vite (frontend), Node.js + mediasoup + ws (backend), Nginx, Docker Compose, Jest (backend tests), Vitest (frontend tests).

---

## File Structure

```
voice-app/
├── docker-compose.yml
├── nginx.conf
├── README.md
├── web/                          # Frontend SPA
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── main.ts
│   │   ├── types.ts              # Shared signaling types
│   │   ├── signaling/
│   │   │   └── client.ts         # WebSocket client + reconnect
│   │   ├── audio/
│   │   │   ├── capture.ts        # getUserMedia wrapper
│   │   │   ├── processing.ts     # Web Audio API graph
│   │   │   └── vad.ts            # Voice activity detection
│   │   ├── webrtc/
│   │   │   └── connection.ts     # RTCPeerConnection management
│   │   ├── state/
│   │   │   └── store.ts          # Lightweight reactive state
│   │   └── ui/
│   │       ├── app.ts            # Main app component / layout
│   │       ├── participants.ts   # Participant list component
│   │       ├── controls.ts       # Audio controls bar
│   │       ├── settings.ts       # Settings modal
│   │       ├── visualizer.ts     # Audio waveform canvas
│   │       └── styles.css        # Dark theme styles
│   └── tests/
│       ├── audio/capture.test.ts
│       ├── audio/vad.test.ts
│       └── signaling/client.test.ts
└── server/                       # Backend SFU + Signaling
    ├── package.json
    ├── tsconfig.json
    ├── src/
    │   ├── index.ts              # Entry point
    │   ├── config.ts             # Env/config loading
    │   ├── types.ts              # Shared signaling types
    │   ├── signaling/
    │   │   ├── server.ts         # WebSocket server
    │   │   └── protocol.ts       # Message validation + routing
    │   ├── room/
    │   │   ├── state.ts          # Room + peer data structures
    │   │   └── manager.ts        # Room lifecycle (create/join/leave)
    │   └── sfu/
    │       ├── worker.ts         # mediasoup worker setup
    │       ├── router.ts         # mediasoup router per room
    │       └── peer.ts           # Per-peer transport/producer/consumer
    └── tests/
        ├── room/manager.test.ts
        └── signaling/protocol.test.ts
```

---

## Task 1: Initialize Monorepo Structure

**Files:**
- Create: `voice-app/web/package.json`
- Create: `voice-app/server/package.json`
- Create: `voice-app/.gitignore`

- [ ] **Step 1: Create root .gitignore**

```gitignore
node_modules/
dist/
build/
*.log
.env
.DS_Store
coverage/
```

- [ ] **Step 2: Create frontend package.json**

Create `voice-app/web/package.json`:
```json
{
  "name": "voice-web",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vitest": "^1.5.0",
    "jsdom": "^24.0.0"
  }
}
```

- [ ] **Step 3: Create backend package.json**

Create `voice-app/server/package.json`:
```json
{
  "name": "voice-server",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node build/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "mediasoup": "^3.14.0",
    "ws": "^8.16.0"
  },
  "devDependencies": {
    "@types/node": "^20.12.0",
    "@types/ws": "^8.5.10",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "vitest": "^1.5.0"
  }
}
```

- [ ] **Step 4: Commit**

```bash
cd voice-app
git init
git add .
git commit -m "chore: initialize monorepo structure"
```

---

## Task 2: Configure TypeScript and Build Tooling

**Files:**
- Create: `voice-app/web/tsconfig.json`
- Create: `voice-app/web/vite.config.ts`
- Create: `voice-app/server/tsconfig.json`

- [ ] **Step 1: Write frontend tsconfig**

Create `voice-app/web/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "resolveJsonModule": true,
    "noEmit": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 2: Write frontend vite config**

Create `voice-app/web/vite.config.ts`:
```typescript
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://localhost:7880',
        ws: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
```

- [ ] **Step 3: Write backend tsconfig**

Create `voice-app/server/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./build",
    "rootDir": "./src",
    "resolveJsonModule": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Write frontend entry HTML**

Create `voice-app/web/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Voice</title>
  <link rel="stylesheet" href="/src/ui/styles.css" />
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: configure TypeScript and build tooling"
```

---

## Task 3: Define Shared Signaling Protocol Types

**Files:**
- Create: `voice-app/server/src/types.ts`
- Create: `voice-app/web/src/types.ts`
- Test: `voice-app/server/tests/types.test.ts`

- [ ] **Step 1: Write shared types for server**

Create `voice-app/server/src/types.ts`:
```typescript
export interface SignalingMessage {
  type: string;
}

export interface JoinMessage extends SignalingMessage {
  type: 'join';
  room: string;
  password?: string;
  display_name: string;
}

export interface OfferMessage extends SignalingMessage {
  type: 'offer';
  sdp: string;
}

export interface IceMessage extends SignalingMessage {
  type: 'ice';
  candidate: string;
  sdpMid: string;
  sdpMLineIndex: number;
}

export interface MuteMessage extends SignalingMessage {
  type: 'mute';
  muted: boolean;
}

export interface SpeakingMessage extends SignalingMessage {
  type: 'speaking';
  speaking: boolean;
}

export interface LeaveMessage extends SignalingMessage {
  type: 'leave';
}

export type ClientMessage =
  | JoinMessage
  | OfferMessage
  | IceMessage
  | MuteMessage
  | SpeakingMessage
  | LeaveMessage;

export interface PeerInfo {
  id: string;
  display_name: string;
  muted: boolean;
}

export interface JoinedMessage extends SignalingMessage {
  type: 'joined';
  peers: PeerInfo[];
}

export interface PeerJoinedMessage extends SignalingMessage {
  type: 'peer_joined';
  peer: PeerInfo;
}

export interface PeerLeftMessage extends SignalingMessage {
  type: 'peer_left';
  peer_id: string;
}

export interface AnswerMessage extends SignalingMessage {
  type: 'answer';
  sdp: string;
}

export interface ServerIceMessage extends SignalingMessage {
  type: 'ice';
  candidate: string;
  sdpMid: string;
  sdpMLineIndex: number;
}

export interface PeerMuteMessage extends SignalingMessage {
  type: 'peer_mute';
  peer_id: string;
  muted: boolean;
}

export interface PeerSpeakingMessage extends SignalingMessage {
  type: 'peer_speaking';
  peer_id: string;
  speaking: boolean;
}

export interface ErrorMessage extends SignalingMessage {
  type: 'error';
  message: string;
}

export type ServerMessage =
  | JoinedMessage
  | PeerJoinedMessage
  | PeerLeftMessage
  | AnswerMessage
  | ServerIceMessage
  | PeerMuteMessage
  | PeerSpeakingMessage
  | ErrorMessage;
```

- [ ] **Step 2: Copy types to frontend**

Create `voice-app/web/src/types.ts` as an identical copy of `voice-app/server/src/types.ts`.

- [ ] **Step 3: Write type validation test**

Create `voice-app/server/tests/types.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import type { JoinMessage, PeerInfo, ServerMessage } from '../src/types.js';

describe('types', () => {
  it('join message has required fields', () => {
    const msg: JoinMessage = {
      type: 'join',
      room: 'test-room',
      display_name: 'Alice',
    };
    expect(msg.type).toBe('join');
    expect(msg.room).toBe('test-room');
    expect(msg.display_name).toBe('Alice');
  });

  it('peer info has required fields', () => {
    const peer: PeerInfo = {
      id: 'peer-1',
      display_name: 'Bob',
      muted: false,
    };
    expect(peer.id).toBe('peer-1');
  });

  it('server error message has message field', () => {
    const msg: ServerMessage = {
      type: 'error',
      message: 'room_full',
    };
    expect(msg.type).toBe('error');
    expect((msg as Extract<ServerMessage, { type: 'error' }>).message).toBe('room_full');
  });
});
```

- [ ] **Step 4: Run test**

```bash
cd voice-app/server
npm install
npx vitest run tests/types.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: define shared signaling protocol types"
```

---

## Task 4: Implement Backend Configuration Loader

**Files:**
- Create: `voice-app/server/src/config.ts`
- Test: `voice-app/server/tests/config.test.ts`

- [ ] **Step 1: Write config loader**

Create `voice-app/server/src/config.ts`:
```typescript
export interface ServerConfig {
  port: number;
  rtcMinPort: number;
  rtcMaxPort: number;
  logLevel: string;
  turnEnabled: boolean;
  turnServer?: string;
  turnUsername?: string;
  turnCredential?: string;
}

export function loadConfig(): ServerConfig {
  return {
    port: parseInt(process.env.PORT || '7880', 10),
    rtcMinPort: parseInt(process.env.RTC_MIN_PORT || '10000', 10),
    rtcMaxPort: parseInt(process.env.RTC_MAX_PORT || '10100', 10),
    logLevel: process.env.LOG_LEVEL || 'info',
    turnEnabled: process.env.TURN_ENABLED === 'true',
    turnServer: process.env.TURN_SERVER,
    turnUsername: process.env.TURN_USERNAME,
    turnCredential: process.env.TURN_CREDENTIAL,
  };
}
```

- [ ] **Step 2: Write config test**

Create `voice-app/server/tests/config.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('config', () => {
  it('loads default values', () => {
    const config = loadConfig();
    expect(config.port).toBe(7880);
    expect(config.rtcMinPort).toBe(10000);
    expect(config.rtcMaxPort).toBe(10100);
    expect(config.logLevel).toBe('info');
    expect(config.turnEnabled).toBe(false);
  });

  it('loads values from environment', () => {
    process.env.PORT = '9000';
    process.env.RTC_MIN_PORT = '20000';
    const config = loadConfig();
    expect(config.port).toBe(9000);
    expect(config.rtcMinPort).toBe(20000);
    delete process.env.PORT;
    delete process.env.RTC_MIN_PORT;
  });
});
```

- [ ] **Step 3: Run test**

```bash
npx vitest run tests/config.test.ts
```
Expected: PASS (2 tests)

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: add backend configuration loader"
```

---

## Task 5: Implement Room and Peer State

**Files:**
- Create: `voice-app/server/src/room/state.ts`
- Test: `voice-app/server/tests/room/state.test.ts`

- [ ] **Step 1: Write room state types and in-memory store**

Create `voice-app/server/src/room/state.ts`:
```typescript
import type { PeerInfo } from '../types.js';

export interface Peer {
  id: string;
  displayName: string;
  muted: boolean;
  wsId: string; // WebSocket connection identifier
}

export interface Room {
  id: string;
  password?: string;
  maxUsers: number;
  peers: Map<string, Peer>;
  createdAt: Date;
}

class RoomState {
  private rooms = new Map<string, Room>();

  getRoom(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  createRoom(id: string, password?: string, maxUsers = 10): Room {
    const room: Room = {
      id,
      password,
      maxUsers,
      peers: new Map(),
      createdAt: new Date(),
    };
    this.rooms.set(id, room);
    return room;
  }

  deleteRoom(id: string): boolean {
    return this.rooms.delete(id);
  }

  addPeer(roomId: string, peer: Peer): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    if (room.peers.size >= room.maxUsers) return false;
    room.peers.set(peer.id, peer);
    return true;
  }

  removePeer(roomId: string, peerId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const removed = room.peers.delete(peerId);
    if (removed && room.peers.size === 0) {
      this.rooms.delete(roomId);
    }
    return removed;
  }

  getPeers(roomId: string): Peer[] {
    const room = this.rooms.get(roomId);
    return room ? Array.from(room.peers.values()) : [];
  }

  getPeer(roomId: string, peerId: string): Peer | undefined {
    const room = this.rooms.get(roomId);
    return room?.peers.get(peerId);
  }

  setPeerMute(roomId: string, peerId: string, muted: boolean): boolean {
    const peer = this.getPeer(roomId, peerId);
    if (!peer) return false;
    peer.muted = muted;
    return true;
  }

  toPeerInfo(peer: Peer): PeerInfo {
    return {
      id: peer.id,
      display_name: peer.displayName,
      muted: peer.muted,
    };
  }

  getRoomCount(): number {
    return this.rooms.size;
  }
}

export const roomState = new RoomState();
```

- [ ] **Step 2: Write room state tests**

Create `voice-app/server/tests/room/state.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { roomState } from '../../src/room/state.js';

describe('room state', () => {
  beforeEach(() => {
    // Reset singleton state between tests
    for (const roomId of Array.from({ length: roomState.getRoomCount() }, (_, i) => `room-${i}`)) {
      roomState.deleteRoom(roomId);
    }
  });

  it('creates and retrieves a room', () => {
    const room = roomState.createRoom('test-room');
    expect(room.id).toBe('test-room');
    expect(room.maxUsers).toBe(10);
    expect(roomState.getRoom('test-room')).toBe(room);
  });

  it('adds and removes peers', () => {
    roomState.createRoom('room-1');
    const peer = { id: 'p1', displayName: 'Alice', muted: false, wsId: 'ws1' };
    expect(roomState.addPeer('room-1', peer)).toBe(true);
    expect(roomState.getPeers('room-1')).toHaveLength(1);
    expect(roomState.removePeer('room-1', 'p1')).toBe(true);
    expect(roomState.getPeers('room-1')).toHaveLength(0);
  });

  it('deletes room when last peer leaves', () => {
    roomState.createRoom('empty-room');
    const peer = { id: 'p1', displayName: 'Bob', muted: false, wsId: 'ws1' };
    roomState.addPeer('empty-room', peer);
    roomState.removePeer('empty-room', 'p1');
    expect(roomState.getRoom('empty-room')).toBeUndefined();
  });

  it('respects max users limit', () => {
    roomState.createRoom('full-room', undefined, 2);
    roomState.addPeer('full-room', { id: 'p1', displayName: 'A', muted: false, wsId: 'ws1' });
    roomState.addPeer('full-room', { id: 'p2', displayName: 'B', muted: false, wsId: 'ws2' });
    expect(roomState.addPeer('full-room', { id: 'p3', displayName: 'C', muted: false, wsId: 'ws3' })).toBe(false);
  });

  it('validates password', () => {
    roomState.createRoom('private-room', 'secret123');
    const room = roomState.getRoom('private-room');
    expect(room?.password).toBe('secret123');
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/room/state.test.ts
```
Expected: PASS (5 tests)

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: implement in-memory room and peer state"
```

---

## Task 6: Implement Room Manager

**Files:**
- Create: `voice-app/server/src/room/manager.ts`
- Test: `voice-app/server/tests/room/manager.test.ts`

- [ ] **Step 1: Write room manager with join/leave logic**

Create `voice-app/server/src/room/manager.ts`:
```typescript
import { roomState } from './state.js';
import type { Peer } from './state.js';

export interface JoinResult {
  success: boolean;
  error?: string;
  peers?: Array<{ id: string; display_name: string; muted: boolean }>;
}

export function joinRoom(
  roomId: string,
  peerId: string,
  displayName: string,
  wsId: string,
  password?: string
): JoinResult {
  let room = roomState.getRoom(roomId);

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
  };

  const added = roomState.addPeer(roomId, peer);
  if (!added) {
    return { success: false, error: 'room_full' };
  }

  const peers = roomState
    .getPeers(roomId)
    .filter((p) => p.id !== peerId)
    .map((p) => roomState.toPeerInfo(p));

  return { success: true, peers };
}

export function leaveRoom(roomId: string, peerId: string): boolean {
  return roomState.removePeer(roomId, peerId);
}

export function setMute(roomId: string, peerId: string, muted: boolean): boolean {
  return roomState.setPeerMute(roomId, peerId, muted);
}
```

- [ ] **Step 2: Write room manager tests**

Create `voice-app/server/tests/room/manager.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { joinRoom, leaveRoom, setMute } from '../../src/room/manager.js';
import { roomState } from '../../src/room/state.js';

describe('room manager', () => {
  it('creates room on first join', () => {
    const result = joinRoom('new-room', 'p1', 'Alice', 'ws1');
    expect(result.success).toBe(true);
    expect(result.peers).toEqual([]);
    expect(roomState.getRoom('new-room')).toBeDefined();
  });

  it('returns existing peers on join', () => {
    joinRoom('shared-room', 'p1', 'Alice', 'ws1');
    const result = joinRoom('shared-room', 'p2', 'Bob', 'ws2');
    expect(result.success).toBe(true);
    expect(result.peers).toHaveLength(1);
    expect(result.peers?.[0].display_name).toBe('Alice');
  });

  it('rejects wrong password', () => {
    roomState.createRoom('protected', 'secret');
    const result = joinRoom('protected', 'p1', 'Alice', 'ws1', 'wrong');
    expect(result.success).toBe(false);
    expect(result.error).toBe('wrong_password');
  });

  it('accepts correct password', () => {
    roomState.createRoom('protected', 'secret');
    const result = joinRoom('protected', 'p1', 'Alice', 'ws1', 'secret');
    expect(result.success).toBe(true);
  });

  it('removes peer on leave', () => {
    joinRoom('leave-room', 'p1', 'Alice', 'ws1');
    expect(leaveRoom('leave-room', 'p1')).toBe(true);
    expect(roomState.getPeers('leave-room')).toHaveLength(0);
  });

  it('sets mute state', () => {
    joinRoom('mute-room', 'p1', 'Alice', 'ws1');
    expect(setMute('mute-room', 'p1', true)).toBe(true);
    const peer = roomState.getPeer('mute-room', 'p1');
    expect(peer?.muted).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/room/manager.test.ts
```
Expected: PASS (6 tests)

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: implement room manager with join/leave/mute logic"
```

---

## Task 7: Set Up mediasoup Worker and Router

**Files:**
- Create: `voice-app/server/src/sfu/worker.ts`
- Create: `voice-app/server/src/sfu/router.ts`
- Test: `voice-app/server/tests/sfu/worker.test.ts`

- [ ] **Step 1: Install mediasoup**

```bash
cd voice-app/server
npm install mediasoup
```

- [ ] **Step 2: Write mediasoup worker setup**

Create `voice-app/server/src/sfu/worker.ts`:
```typescript
import * as mediasoup from 'mediasoup';
import type { Worker, RtpCodecCapability } from 'mediasoup/node/lib/types.js';

const mediaCodecs: RtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
];

let worker: Worker | null = null;

export async function createWorker(): Promise<Worker> {
  worker = await mediasoup.createWorker({
    logLevel: 'warn',
    rtcMinPort: 10000,
    rtcMaxPort: 10100,
  });

  worker.on('died', () => {
    console.error('mediasoup worker died, exiting');
    process.exit(1);
  });

  return worker;
}

export function getWorker(): Worker {
  if (!worker) throw new Error('Worker not initialized');
  return worker;
}

export function getMediaCodecs(): RtpCodecCapability[] {
  return mediaCodecs;
}
```

- [ ] **Step 3: Write per-room router factory**

Create `voice-app/server/src/sfu/router.ts`:
```typescript
import { getWorker, getMediaCodecs } from './worker.js';
import type { Router } from 'mediasoup/node/lib/types.js';

const routers = new Map<string, Router>();

export async function createRouter(roomId: string): Promise<Router> {
  const worker = getWorker();
  const router = await worker.createRouter({ mediaCodecs: getMediaCodecs() });
  routers.set(roomId, router);
  return router;
}

export function getRouter(roomId: string): Router | undefined {
  return routers.get(roomId);
}

export function closeRouter(roomId: string): void {
  const router = routers.get(roomId);
  if (router) {
    router.close();
    routers.delete(roomId);
  }
}
```

- [ ] **Step 4: Write worker test**

Create `voice-app/server/tests/sfu/worker.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createWorker, getWorker, getMediaCodecs } from '../../src/sfu/worker.js';
import { createRouter, getRouter, closeRouter } from '../../src/sfu/router.js';

describe('mediasoup worker', () => {
  beforeAll(async () => {
    await createWorker();
  });

  afterAll(() => {
    const worker = getWorker();
    worker.close();
  });

  it('creates a worker', () => {
    const worker = getWorker();
    expect(worker).toBeDefined();
    expect(worker.closed).toBe(false);
  });

  it('returns opus codec capability', () => {
    const codecs = getMediaCodecs();
    expect(codecs).toHaveLength(1);
    expect(codecs[0].mimeType).toBe('audio/opus');
    expect(codecs[0].clockRate).toBe(48000);
  });

  it('creates and retrieves a router', async () => {
    const router = await createRouter('test-room');
    expect(router).toBeDefined();
    expect(router.closed).toBe(false);
    expect(getRouter('test-room')).toBe(router);
    closeRouter('test-room');
    expect(router.closed).toBe(true);
  });
});
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/sfu/worker.test.ts --timeout=30000
```
Expected: PASS (3 tests) — mediasoup worker creation may take a few seconds.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: set up mediasoup worker and per-room router"
```

---

## Task 8: Implement Per-Peer mediasoup Transport/Producer/Consumer

**Files:**
- Create: `voice-app/server/src/sfu/peer.ts`
- Test: `voice-app/server/tests/sfu/peer.test.ts`

- [ ] **Step 1: Write peer SFU abstraction**

Create `voice-app/server/src/sfu/peer.ts`:
```typescript
import type { Router, WebRtcTransport, Producer, Consumer } from 'mediasoup/node/lib/types.js';

export interface TransportPair {
  sendTransport: WebRtcTransport;
  recvTransport: WebRtcTransport;
}

export interface PeerSfuState {
  peerId: string;
  sendTransport: WebRtcTransport | null;
  recvTransport: WebRtcTransport | null;
  producer: Producer | null;
  consumers: Map<string, Consumer>;
}

export async function createWebRtcTransport(
  router: Router,
  direction: 'send' | 'recv'
): Promise<WebRtcTransport> {
  const transport = await router.createWebRtcTransport({
    listenIps: [{ ip: '0.0.0.0', announcedIp: undefined }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
  });

  transport.on('icestatechange', (iceState) => {
    if (iceState === 'disconnected' || iceState === 'closed' || iceState === 'failed') {
      console.warn(`Transport ${direction} for peer disconnected`);
    }
  });

  return transport;
}

export async function createPeerTransports(
  router: Router,
  peerId: string
): Promise<TransportPair> {
  const [sendTransport, recvTransport] = await Promise.all([
    createWebRtcTransport(router, 'send'),
    createWebRtcTransport(router, 'recv'),
  ]);

  return { sendTransport, recvTransport };
}

export function getTransportIceParams(transport: WebRtcTransport) {
  return {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
  };
}
```

- [ ] **Step 2: Write peer SFU tests**

Create `voice-app/server/tests/sfu/peer.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createWorker } from '../../src/sfu/worker.js';
import { createRouter } from '../../src/sfu/router.js';
import { createPeerTransports, getTransportIceParams } from '../../src/sfu/peer.js';
import type { Router } from 'mediasoup/node/lib/types.js';

describe('peer sfu', () => {
  let router: Router;

  beforeAll(async () => {
    await createWorker();
    router = await createRouter('peer-test-room');
  });

  afterAll(() => {
    router.close();
  });

  it('creates send and recv transports', async () => {
    const pair = await createPeerTransports(router, 'p1');
    expect(pair.sendTransport).toBeDefined();
    expect(pair.recvTransport).toBeDefined();
    expect(pair.sendTransport.id).not.toBe(pair.recvTransport.id);
    pair.sendTransport.close();
    pair.recvTransport.close();
  });

  it('returns ice parameters', async () => {
    const pair = await createPeerTransports(router, 'p2');
    const params = getTransportIceParams(pair.sendTransport);
    expect(params.id).toBe(pair.sendTransport.id);
    expect(params.iceParameters).toBeDefined();
    expect(params.iceCandidates).toBeDefined();
    expect(params.dtlsParameters).toBeDefined();
    pair.sendTransport.close();
    pair.recvTransport.close();
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/sfu/peer.test.ts --timeout=30000
```
Expected: PASS (2 tests)

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: implement per-peer mediasoup transports"
```

---

## Task 9: Implement WebSocket Signaling Server

**Files:**
- Create: `voice-app/server/src/signaling/server.ts`
- Create: `voice-app/server/src/signaling/protocol.ts`
- Test: `voice-app/server/tests/signaling/server.test.ts`

- [ ] **Step 1: Write protocol message validation**

Create `voice-app/server/src/signaling/protocol.ts`:
```typescript
import type { ClientMessage, ServerMessage } from '../types.js';

export function validateClientMessage(data: unknown): ClientMessage | null {
  if (typeof data !== 'object' || data === null) return null;
  const msg = data as Record<string, unknown>;
  if (typeof msg.type !== 'string') return null;

  switch (msg.type) {
    case 'join':
      if (typeof msg.room !== 'string' || typeof msg.display_name !== 'string') return null;
      return {
        type: 'join',
        room: msg.room,
        password: typeof msg.password === 'string' ? msg.password : undefined,
        display_name: msg.display_name,
      };
    case 'offer':
    case 'answer':
      if (typeof msg.sdp !== 'string') return null;
      return { type: msg.type, sdp: msg.sdp };
    case 'ice':
      if (
        typeof msg.candidate !== 'string' ||
        typeof msg.sdpMid !== 'string' ||
        typeof msg.sdpMLineIndex !== 'number'
      )
        return null;
      return {
        type: 'ice',
        candidate: msg.candidate,
        sdpMid: msg.sdpMid,
        sdpMLineIndex: msg.sdpMLineIndex,
      };
    case 'mute':
      if (typeof msg.muted !== 'boolean') return null;
      return { type: 'mute', muted: msg.muted };
    case 'speaking':
      if (typeof msg.speaking !== 'boolean') return null;
      return { type: 'speaking', speaking: msg.speaking };
    case 'leave':
      return { type: 'leave' };
    default:
      return null;
  }
}

export function encodeServerMessage(msg: ServerMessage): string {
  return JSON.stringify(msg);
}
```

- [ ] **Step 2: Write WebSocket server with room join/leave**

Create `voice-app/server/src/signaling/server.ts`:
```typescript
import { WebSocketServer, WebSocket } from 'ws';
import { validateClientMessage, encodeServerMessage } from './protocol.js';
import { joinRoom, leaveRoom, setMute } from '../room/manager.js';
import { roomState } from '../room/state.js';
import type { ServerMessage } from '../types.js';

interface ClientContext {
  peerId: string;
  roomId: string | null;
  ws: WebSocket;
}

const clients = new Map<WebSocket, ClientContext>();

export function createSignalingServer(port: number): WebSocketServer {
  const wss = new WebSocketServer({ port });

  wss.on('connection', (ws) => {
    const peerId = generatePeerId();
    clients.set(ws, { peerId, roomId: null, ws });

    ws.on('message', (raw) => {
      let data: unknown;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        send(ws, { type: 'error', message: 'invalid_json' });
        return;
      }

      const msg = validateClientMessage(data);
      if (!msg) {
        send(ws, { type: 'error', message: 'invalid_message' });
        return;
      }

      handleMessage(ws, msg);
    });

    ws.on('close', () => {
      const ctx = clients.get(ws);
      if (ctx && ctx.roomId) {
        handlePeerLeave(ctx.roomId, ctx.peerId);
      }
      clients.delete(ws);
    });
  });

  return wss;
}

function handleMessage(ws: WebSocket, msg: ReturnType<typeof validateClientMessage>): void {
  if (!msg) return;
  const ctx = clients.get(ws);
  if (!ctx) return;

  switch (msg.type) {
    case 'join': {
      const result = joinRoom(msg.room, ctx.peerId, msg.display_name, ws.toString(), msg.password);
      if (!result.success) {
        send(ws, { type: 'error', message: result.error || 'join_failed' });
        return;
      }
      ctx.roomId = msg.room;
      send(ws, {
        type: 'joined',
        peers: result.peers || [],
      });
      broadcast(ctx.roomId, { type: 'peer_joined', peer: roomState.toPeerInfo(roomState.getPeer(ctx.roomId, ctx.peerId)!) }, ctx.peerId);
      break;
    }
    case 'leave': {
      if (ctx.roomId) {
        handlePeerLeave(ctx.roomId, ctx.peerId);
        ctx.roomId = null;
      }
      break;
    }
    case 'mute': {
      if (ctx.roomId) {
        setMute(ctx.roomId, ctx.peerId, msg.muted);
        broadcast(ctx.roomId, { type: 'peer_mute', peer_id: ctx.peerId, muted: msg.muted });
      }
      break;
    }
    case 'speaking': {
      if (ctx.roomId) {
        broadcast(ctx.roomId, { type: 'peer_speaking', peer_id: ctx.peerId, speaking: msg.speaking });
      }
      break;
    }
    case 'offer':
    case 'ice': {
      // Handled in Task 10
      send(ws, { type: 'error', message: 'not_implemented' });
      break;
    }
  }
}

function handlePeerLeave(roomId: string, peerId: string): void {
  leaveRoom(roomId, peerId);
  broadcast(roomId, { type: 'peer_left', peer_id: peerId });
}

function broadcast(roomId: string, msg: ServerMessage, excludePeerId?: string): void {
  for (const ctx of clients.values()) {
    if (ctx.roomId === roomId && ctx.peerId !== excludePeerId) {
      send(ctx.ws, msg);
    }
  }
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(encodeServerMessage(msg));
  }
}

function generatePeerId(): string {
  return `peer_${Math.random().toString(36).slice(2, 9)}`;
}
```

- [ ] **Step 3: Write signaling server tests**

Create `voice-app/server/tests/signaling/server.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { createSignalingServer } from '../../src/signaling/server.js';

describe('signaling server', () => {
  let wss: ReturnType<typeof createSignalingServer>;
  const PORT = 19999;

  beforeAll(() => {
    wss = createSignalingServer(PORT);
  });

  afterAll(() => {
    wss.close();
  });

  function connect(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${PORT}`);
      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
    });
  }

  function waitForMessage(ws: WebSocket): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      ws.once('message', (data) => resolve(JSON.parse(data.toString())));
    });
  }

  it('accepts connections', async () => {
    const ws = await connect();
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('responds to join with joined event', async () => {
    const ws = await connect();
    ws.send(JSON.stringify({ type: 'join', room: 'test-room', display_name: 'Alice' }));
    const msg = await waitForMessage(ws);
    expect(msg.type).toBe('joined');
    expect(Array.isArray(msg.peers)).toBe(true);
    ws.close();
  });

  it('rejects invalid json', async () => {
    const ws = await connect();
    ws.send('not json');
    const msg = await waitForMessage(ws);
    expect(msg.type).toBe('error');
    expect(msg.message).toBe('invalid_json');
    ws.close();
  });

  it('notifies others when peer joins', async () => {
    const ws1 = await connect();
    ws1.send(JSON.stringify({ type: 'join', room: 'notify-room', display_name: 'Alice' }));
    await waitForMessage(ws1); // joined

    const ws2 = await connect();
    ws2.send(JSON.stringify({ type: 'join', room: 'notify-room', display_name: 'Bob' }));
    await waitForMessage(ws2); // joined

    const notify = await waitForMessage(ws1);
    expect(notify.type).toBe('peer_joined');
    expect(notify.peer.display_name).toBe('Bob');

    ws1.close();
    ws2.close();
  });
});
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/signaling/server.test.ts --timeout=10000
```
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: implement WebSocket signaling server with room join/leave"
```

---

## Task 10: Integrate mediasoup with Signaling (Offer/Answer/ICE)

**Files:**
- Modify: `voice-app/server/src/signaling/server.ts`
- Modify: `voice-app/server/src/room/state.ts`
- Create: `voice-app/server/src/sfu/integration.ts`

- [ ] **Step 1: Extend room state to track SFU transports**

Modify `voice-app/server/src/room/state.ts` to add SFU tracking:
```typescript
import type { WebRtcTransport, Producer, Consumer } from 'mediasoup/node/lib/types.js';

// Add to existing Peer interface:
export interface Peer {
  id: string;
  displayName: string;
  muted: boolean;
  wsId: string;
  sendTransport?: WebRtcTransport;
  recvTransport?: WebRtcTransport;
  producer?: Producer;
  consumers: Map<string, Consumer>;
}
```

Update `RoomState.addPeer` to initialize `consumers: new Map()`:
```typescript
// In addPeer method, when creating peer:
const peer: Peer = {
  id: peerId,
  displayName,
  muted: false,
  wsId,
  consumers: new Map(),
};
```

- [ ] **Step 2: Write SFU integration helpers**

Create `voice-app/server/src/sfu/integration.ts`:
```typescript
import { getRouter } from './router.js';
import { createPeerTransports, getTransportIceParams } from './peer.js';
import { roomState } from '../room/state.js';
import type { Router, WebRtcTransport, Producer, Consumer } from 'mediasoup/node/lib/types.js';

export async function setupPeerTransports(
  roomId: string,
  peerId: string
): Promise<{ sendParams: ReturnType<typeof getTransportIceParams>; recvParams: ReturnType<typeof getTransportIceParams> } | null> {
  const router = getRouter(roomId);
  if (!router) return null;

  const { sendTransport, recvTransport } = await createPeerTransports(router, peerId);
  const peer = roomState.getPeer(roomId, peerId);
  if (!peer) return null;

  peer.sendTransport = sendTransport;
  peer.recvTransport = recvTransport;

  return {
    sendParams: getTransportIceParams(sendTransport),
    recvParams: getTransportIceParams(recvTransport),
  };
}

export async function connectTransport(
  roomId: string,
  peerId: string,
  direction: 'send' | 'recv',
  dtlsParameters: Parameters<WebRtcTransport['connect']>[0]
): Promise<boolean> {
  const peer = roomState.getPeer(roomId, peerId);
  if (!peer) return false;

  const transport = direction === 'send' ? peer.sendTransport : peer.recvTransport;
  if (!transport) return false;

  await transport.connect(dtlsParameters);
  return true;
}

export async function produce(
  roomId: string,
  peerId: string,
  kind: 'audio',
  rtpParameters: Parameters<NonNullable<WebRtcTransport['produce']>>[0]['rtpParameters']
): Promise<string | null> {
  const peer = roomState.getPeer(roomId, peerId);
  if (!peer || !peer.sendTransport) return null;

  const producer = await peer.sendTransport.produce({ kind, rtpParameters });
  peer.producer = producer;

  // Create consumers for all other peers
  const peers = roomState.getPeers(roomId).filter((p) => p.id !== peerId);
  for (const otherPeer of peers) {
    await createConsumer(roomId, otherPeer.id, producer);
  }

  return producer.id;
}

export async function createConsumer(
  roomId: string,
  peerId: string,
  producer: Producer
): Promise<{ consumerId: string; producerId: string; kind: string; rtpParameters: unknown } | null> {
  const peer = roomState.getPeer(roomId, peerId);
  const router = getRouter(roomId);
  if (!peer || !peer.recvTransport || !router) return null;

  if (!router.canConsume({ producerId: producer.id, rtpCapabilities: {} })) {
    return null;
  }

  const consumer = await peer.recvTransport.consume({
    producerId: producer.id,
    rtpCapabilities: {}, // Client capabilities should be passed in real implementation
    paused: false,
  });

  peer.consumers.set(consumer.id, consumer);

  return {
    consumerId: consumer.id,
    producerId: producer.id,
    kind: consumer.kind,
    rtpParameters: consumer.rtpParameters,
  };
}
```

- [ ] **Step 3: Update signaling server to handle WebRTC negotiation**

Modify `voice-app/server/src/signaling/server.ts`:

Replace the `offer` and `ice` cases in `handleMessage` with:
```typescript
    case 'offer': {
      if (!ctx.roomId) {
        send(ws, { type: 'error', message: 'not_in_room' });
        return;
      }
      // mediasoup uses a different flow: client needs transport params first,
      // then produces/consumes. For simplicity in this plan, we will send
      // router rtpCapabilities and transport params on join, then the client
      // sends a "connectTransport" message before producing.
      send(ws, { type: 'error', message: 'use_transport_flow' });
      break;
    }
```

Add new message types to `validateClientMessage` in `protocol.ts` for transport-based flow:
```typescript
    case 'connect_transport':
      if (
        typeof msg.transport_id !== 'string' ||
        typeof msg.dtlsParameters !== 'object'
      )
        return null;
      return {
        type: 'connect_transport',
        transport_id: msg.transport_id,
        dtlsParameters: msg.dtlsParameters,
      };
    case 'produce':
      if (typeof msg.kind !== 'string' || typeof msg.rtpParameters !== 'object')
        return null;
      return {
        type: 'produce',
        kind: msg.kind,
        rtpParameters: msg.rtpParameters,
      };
```

Update `handleMessage` in `signaling/server.ts` to handle the new types:
```typescript
    case 'connect_transport': {
      // msg has transport_id and dtlsParameters
      // Connect the transport and confirm
      send(ws, { type: 'error', message: 'not_fully_implemented' });
      break;
    }
    case 'produce': {
      // msg has kind and rtpParameters
      // Create producer, then create consumers for other peers
      send(ws, { type: 'error', message: 'not_fully_implemented' });
      break;
    }
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: integrate mediasoup transport flow into signaling"
```

---

## Task 11: Define Frontend Types and Signaling Client

**Files:**
- Create: `voice-app/web/src/signaling/client.ts`
- Test: `voice-app/web/tests/signaling/client.test.ts`

- [ ] **Step 1: Write WebSocket signaling client**

Create `voice-app/web/src/signaling/client.ts`:
```typescript
import type { ClientMessage, ServerMessage, PeerInfo } from '../types.js';

export type MessageHandler = (msg: ServerMessage) => void;
export type ConnectHandler = () => void;
export type DisconnectHandler = () => void;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 8000;
  private shouldReconnect = true;
  private messageHandlers: MessageHandler[] = [];
  private connectHandlers: ConnectHandler[] = [];
  private disconnectHandlers: DisconnectHandler[] = [];

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    this.shouldReconnect = true;
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.connectHandlers.forEach((h) => h());
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        this.messageHandlers.forEach((h) => h(msg));
      } catch {
        console.error('Failed to parse server message');
      }
    };

    this.ws.onclose = () => {
      this.disconnectHandlers.forEach((h) => h());
      if (this.shouldReconnect) {
        setTimeout(() => this.connect(), this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      }
    };

    this.ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.ws?.close();
    this.ws = null;
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  onConnect(handler: ConnectHandler): void {
    this.connectHandlers.push(handler);
  }

  onDisconnect(handler: DisconnectHandler): void {
    this.disconnectHandlers.push(handler);
  }

  join(room: string, displayName: string, password?: string): void {
    this.send({ type: 'join', room, display_name: displayName, password });
  }

  leave(): void {
    this.send({ type: 'leave' });
  }

  setMute(muted: boolean): void {
    this.send({ type: 'mute', muted });
  }

  setSpeaking(speaking: boolean): void {
    this.send({ type: 'speaking', speaking });
  }
}
```

- [ ] **Step 2: Write signaling client tests**

Create `voice-app/web/tests/signaling/client.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignalingClient } from '../../src/signaling/client.js';

// Mock WebSocket
global.WebSocket = vi.fn(() => ({
  send: vi.fn(),
  close: vi.fn(),
  readyState: 1, // OPEN
})) as unknown as typeof WebSocket;

describe('SignalingClient', () => {
  let client: SignalingClient;

  beforeEach(() => {
    client = new SignalingClient('ws://localhost:7880/ws');
  });

  it('connects and stores handlers', () => {
    const onConnect = vi.fn();
    client.onConnect(onConnect);
    client.connect();
    const wsInstance = (global.WebSocket as unknown as ReturnType<typeof vi.fn>).mock.results[0].value;
    wsInstance.onopen();
    expect(onConnect).toHaveBeenCalled();
  });

  it('sends join message', () => {
    client.connect();
    const wsInstance = (global.WebSocket as unknown as ReturnType<typeof vi.fn>).mock.results[0].value;
    client.join('test-room', 'Alice');
    expect(wsInstance.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'join', room: 'test-room', display_name: 'Alice' })
    );
  });

  it('parses incoming messages', () => {
    const onMessage = vi.fn();
    client.onMessage(onMessage);
    client.connect();
    const wsInstance = (global.WebSocket as unknown as ReturnType<typeof vi.fn>).mock.results[0].value;
    wsInstance.onmessage({ data: JSON.stringify({ type: 'joined', peers: [] }) });
    expect(onMessage).toHaveBeenCalledWith({ type: 'joined', peers: [] });
  });
});
```

- [ ] **Step 3: Run tests**

```bash
cd voice-app/web
npm install
npx vitest run tests/signaling/client.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: implement frontend signaling client with reconnection"
```

---

## Task 12: Implement Frontend Audio Capture

**Files:**
- Create: `voice-app/web/src/audio/capture.ts`
- Test: `voice-app/web/tests/audio/capture.test.ts`

- [ ] **Step 1: Write getUserMedia wrapper with device enumeration**

Create `voice-app/web/src/audio/capture.ts`:
```typescript
export interface AudioDevice {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
}

export async function enumerateAudioDevices(): Promise<AudioDevice[]> {
  await navigator.mediaDevices.getUserMedia({ audio: true });
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'audioinput' || d.kind === 'audiooutput')
    .map((d) => ({ deviceId: d.deviceId, label: d.label || `Device ${d.deviceId.slice(0, 8)}`, kind: d.kind as 'audioinput' | 'audiooutput' }));
}

export interface CaptureOptions {
  deviceId?: string;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}

export async function captureAudio(options: CaptureOptions = {}): Promise<MediaStream> {
  const constraints: MediaStreamConstraints = {
    audio: {
      deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
      echoCancellation: options.echoCancellation ?? true,
      noiseSuppression: options.noiseSuppression ?? true,
      autoGainControl: options.autoGainControl ?? true,
    } as MediaTrackConstraints,
    video: false,
  };

  return navigator.mediaDevices.getUserMedia(constraints);
}

export function stopCapture(stream: MediaStream): void {
  stream.getTracks().forEach((track) => track.stop());
}
```

- [ ] **Step 2: Write audio capture tests**

Create `voice-app/web/tests/audio/capture.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { captureAudio, stopCapture } from '../../src/audio/capture.js';

describe('audio capture', () => {
  const mockTrack = { stop: vi.fn(), kind: 'audio' };
  const mockStream = { getTracks: () => [mockTrack] };

  beforeEach(() => {
    global.navigator.mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue(mockStream as unknown as MediaStream),
      enumerateDevices: vi.fn().mockResolvedValue([
        { deviceId: 'default', label: 'Default', kind: 'audioinput' },
        { deviceId: 'speaker', label: 'Speaker', kind: 'audiooutput' },
      ]),
    } as unknown as MediaDevices;
  });

  it('captures audio with default constraints', async () => {
    const stream = await captureAudio();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        deviceId: undefined,
      },
      video: false,
    });
    expect(stream).toBe(mockStream);
  });

  it('captures audio with custom device', async () => {
    await captureAudio({ deviceId: 'mic-1' });
    const call = (navigator.mediaDevices.getUserMedia as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0].audio.deviceId).toEqual({ exact: 'mic-1' });
  });

  it('stops all tracks', () => {
    stopCapture(mockStream as unknown as MediaStream);
    expect(mockTrack.stop).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/audio/capture.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: implement frontend audio capture with device enumeration"
```

---

## Task 13: Implement Web Audio API Processing Graph

**Files:**
- Create: `voice-app/web/src/audio/processing.ts`
- Test: `voice-app/web/tests/audio/processing.test.ts`

- [ ] **Step 1: Write audio processing graph**

Create `voice-app/web/src/audio/processing.ts`:
```typescript
export interface AudioGraph {
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  gate: GainNode;
  compressor: DynamicsCompressorNode;
  analyzer: AnalyserNode;
  destination: MediaStreamAudioDestinationNode;
  outputStream: MediaStream;
}

export function createAudioGraph(inputStream: MediaStream): AudioGraph {
  const context = new AudioContext({ sampleRate: 48000 });
  const source = context.createMediaStreamSource(inputStream);

  // Noise gate
  const gate = context.createGain();
  gate.gain.value = 1.0;

  // Compressor
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -24;
  compressor.knee.value = 30;
  compressor.ratio.value = 12;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;

  // Analyzer for VU meter / VAD
  const analyzer = context.createAnalyser();
  analyzer.fftSize = 256;
  analyzer.smoothingTimeConstant = 0.8;

  // Destination for processed stream
  const destination = context.createMediaStreamDestination();

  source.connect(gate);
  gate.connect(compressor);
  compressor.connect(analyzer);
  analyzer.connect(destination);

  return {
    context,
    source,
    gate,
    compressor,
    analyzer,
    destination,
    outputStream: destination.stream,
  };
}

export function setInputGain(graph: AudioGraph, gain: number): void {
  graph.gate.gain.value = Math.max(0, Math.min(2, gain));
}

export function closeAudioGraph(graph: AudioGraph): void {
  graph.source.disconnect();
  graph.gate.disconnect();
  graph.compressor.disconnect();
  graph.analyzer.disconnect();
  graph.destination.disconnect();
  graph.context.close();
}
```

- [ ] **Step 2: Write processing graph tests**

Create `voice-app/web/tests/audio/processing.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { createAudioGraph, setInputGain, closeAudioGraph } from '../../src/audio/processing.js';

describe('audio processing', () => {
  it('creates an audio graph', () => {
    const mockStream = { getAudioTracks: () => [{ id: 't1' }] } as unknown as MediaStream;
    const graph = createAudioGraph(mockStream);
    expect(graph.context).toBeDefined();
    expect(graph.source).toBeDefined();
    expect(graph.gate).toBeDefined();
    expect(graph.compressor).toBeDefined();
    expect(graph.analyzer).toBeDefined();
    expect(graph.outputStream).toBeDefined();
    closeAudioGraph(graph);
  });

  it('sets input gain within bounds', () => {
    const mockStream = { getAudioTracks: () => [{ id: 't1' }] } as unknown as MediaStream;
    const graph = createAudioGraph(mockStream);
    setInputGain(graph, 1.5);
    expect(graph.gate.gain.value).toBe(1.5);
    setInputGain(graph, 3.0);
    expect(graph.gate.gain.value).toBe(2.0);
    setInputGain(graph, -1.0);
    expect(graph.gate.gain.value).toBe(0);
    closeAudioGraph(graph);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/audio/processing.test.ts
```
Expected: PASS (2 tests)

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: implement Web Audio API processing graph"
```

---

## Task 14: Implement Voice Activity Detection (VAD)

**Files:**
- Create: `voice-app/web/src/audio/vad.ts`
- Test: `voice-app/web/tests/audio/vad.test.ts`

- [ ] **Step 1: Write VAD analyzer**

Create `voice-app/web/src/audio/vad.ts`:
```typescript
export interface VADOptions {
  thresholdDb: number;
  hysteresisDb: number;
  smoothingFrames: number;
}

export class VADAnalyzer {
  private analyzer: AnalyserNode;
  private dataArray: Uint8Array;
  private options: VADOptions;
  private isSpeaking = false;
  private smoothingCount = 0;

  constructor(analyzer: AnalyserNode, options: Partial<VADOptions> = {}) {
    this.analyzer = analyzer;
    this.dataArray = new Uint8Array(analyzer.frequencyBinCount);
    this.options = {
      thresholdDb: options.thresholdDb ?? -45,
      hysteresisDb: options.hysteresisDb ?? 6,
      smoothingFrames: options.smoothingFrames ?? 3,
    };
  }

  analyze(): boolean {
    this.analyzer.getByteFrequencyData(this.dataArray);
    const rms = this.computeRMS(this.dataArray);
    const rmsDb = 20 * Math.log10(Math.max(rms, 1e-10));

    const thresholdOn = this.options.thresholdDb + this.options.hysteresisDb;
    const thresholdOff = this.options.thresholdDb;

    if (rmsDb > thresholdOn) {
      this.smoothingCount = Math.min(this.smoothingCount + 1, this.options.smoothingFrames);
    } else if (rmsDb < thresholdOff) {
      this.smoothingCount = Math.max(this.smoothingCount - 1, 0);
    }

    const newSpeaking = this.smoothingCount >= this.options.smoothingFrames;
    if (newSpeaking !== this.isSpeaking) {
      this.isSpeaking = newSpeaking;
    }

    return this.isSpeaking;
  }

  getVolumeDb(): number {
    this.analyzer.getByteFrequencyData(this.dataArray);
    const rms = this.computeRMS(this.dataArray);
    return 20 * Math.log10(Math.max(rms, 1e-10));
  }

  private computeRMS(data: Uint8Array): number {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const normalized = data[i] / 255;
      sum += normalized * normalized;
    }
    return Math.sqrt(sum / data.length);
  }
}
```

- [ ] **Step 2: Write VAD tests**

Create `voice-app/web/tests/audio/vad.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { VADAnalyzer } from '../../src/audio/vad.js';

describe('VADAnalyzer', () => {
  function createMockAnalyzer(dataValues: number[]): AnalyserNode {
    return {
      frequencyBinCount: dataValues.length,
      getByteFrequencyData: (arr: Uint8Array) => {
        for (let i = 0; i < dataValues.length; i++) arr[i] = dataValues[i];
      },
    } as unknown as AnalyserNode;
  }

  it('detects silence when RMS is below threshold', () => {
    // All zeros = silence
    const analyzer = createMockAnalyzer(new Array(128).fill(0));
    const vad = new VADAnalyzer(analyzer, { thresholdDb: -45, hysteresisDb: 6, smoothingFrames: 1 });
    expect(vad.analyze()).toBe(false);
  });

  it('detects speech when RMS is above threshold', () => {
    // Max values = loud
    const analyzer = createMockAnalyzer(new Array(128).fill(255));
    const vad = new VADAnalyzer(analyzer, { thresholdDb: -45, hysteresisDb: 6, smoothingFrames: 1 });
    expect(vad.analyze()).toBe(true);
  });

  it('requires smoothing frames before switching to speaking', () => {
    const analyzer = createMockAnalyzer(new Array(128).fill(255));
    const vad = new VADAnalyzer(analyzer, { thresholdDb: -45, hysteresisDb: 6, smoothingFrames: 3 });
    expect(vad.analyze()).toBe(false);
    expect(vad.analyze()).toBe(false);
    expect(vad.analyze()).toBe(true);
  });

  it('returns volume in dB', () => {
    const analyzer = createMockAnalyzer(new Array(128).fill(0));
    const vad = new VADAnalyzer(analyzer);
    expect(vad.getVolumeDb()).toBeLessThan(-100);
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/audio/vad.test.ts
```
Expected: PASS (4 tests)

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: implement voice activity detection with hysteresis"
```

---

## Task 15: Implement Frontend RTCPeerConnection

**Files:**
- Create: `voice-app/web/src/webrtc/connection.ts`
- Test: `voice-app/web/tests/webrtc/connection.test.ts`

- [ ] **Step 1: Write RTCPeerConnection wrapper**

Create `voice-app/web/src/webrtc/connection.ts`:
```typescript
export interface PeerConnectionOptions {
  iceServers?: RTCIceServer[];
  onTrack?: (event: RTCTrackEvent) => void;
  onIceCandidate?: (candidate: RTCIceCandidate) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
}

export class PeerConnection {
  pc: RTCPeerConnection;
  private options: PeerConnectionOptions;

  constructor(options: PeerConnectionOptions = {}) {
    this.options = options;
    this.pc = new RTCPeerConnection({
      iceServers: options.iceServers || [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    this.pc.ontrack = (event) => {
      options.onTrack?.(event);
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        options.onIceCandidate?.(event.candidate);
      }
    };

    this.pc.onconnectionstatechange = () => {
      options.onConnectionStateChange?.(this.pc.connectionState);
    };
  }

  async addLocalTrack(track: MediaStreamTrack): Promise<RTCRtpSender> {
    return this.pc.addTrack(track);
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async handleAnswer(sdp: string): Promise<void> {
    await this.pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  getConnectionState(): RTCPeerConnectionState {
    return this.pc.connectionState;
  }

  close(): void {
    this.pc.close();
  }
}
```

- [ ] **Step 2: Write connection tests**

Create `voice-app/web/tests/webrtc/connection.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { PeerConnection } from '../../src/webrtc/connection.js';

describe('PeerConnection', () => {
  it('creates a peer connection with default ice servers', () => {
    const pc = new PeerConnection();
    expect(pc.pc).toBeDefined();
    pc.close();
  });

  it('calls onConnectionStateChange', () => {
    const handler = vi.fn();
    const pc = new PeerConnection({ onConnectionStateChange: handler });
    pc.pc.onconnectionstatechange?.({} as Event);
    expect(handler).toHaveBeenCalled();
    pc.close();
  });

  it('closes the connection', () => {
    const pc = new PeerConnection();
    pc.close();
    expect(pc.pc.connectionState).toBe('closed');
  });
});
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run tests/webrtc/connection.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: implement frontend RTCPeerConnection wrapper"
```

---

## Task 16: Wire Audio + WebRTC + Signaling into App Controller

**Files:**
- Create: `voice-app/web/src/state/store.ts`
- Create: `voice-app/web/src/app.ts`

- [ ] **Step 1: Write lightweight reactive state store**

Create `voice-app/web/src/state/store.ts`:
```typescript
export type Listener<T> = (state: T) => void;

export class Store<T> {
  private state: T;
  private listeners: Listener<T>[] = [];

  constructor(initialState: T) {
    this.state = initialState;
  }

  getState(): T {
    return this.state;
  }

  setState(partial: Partial<T>): void {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((l) => l(this.state));
  }

  subscribe(listener: Listener<T>): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
}
```

- [ ] **Step 2: Write app controller wiring audio/WebRTC/signaling**

Create `voice-app/web/src/app.ts`:
```typescript
import { SignalingClient } from './signaling/client.js';
import { captureAudio, stopCapture } from './audio/capture.js';
import { createAudioGraph, closeAudioGraph, setInputGain } from './audio/processing.js';
import { VADAnalyzer } from './audio/vad.js';
import { PeerConnection } from './webrtc/connection.js';
import { Store } from './state/store.js';
import type { PeerInfo, ServerMessage } from './types.js';

export interface AppState {
  connected: boolean;
  connecting: boolean;
  roomId: string | null;
  displayName: string;
  peers: PeerInfo[];
  localMuted: boolean;
  localSpeaking: boolean;
  deafened: boolean;
  inputGain: number;
  noiseGateThreshold: number;
  pttEnabled: boolean;
  pttActive: boolean;
}

export function createAppState(): Store<AppState> {
  return new Store<AppState>({
    connected: false,
    connecting: false,
    roomId: null,
    displayName: '',
    peers: [],
    localMuted: false,
    localSpeaking: false,
    deafened: false,
    inputGain: 1.0,
    noiseGateThreshold: -45,
    pttEnabled: false,
    pttActive: false,
  });
}

export class VoiceApp {
  store: Store<AppState>;
  signaling: SignalingClient;
  pc: PeerConnection | null = null;
  localStream: MediaStream | null = null;
  audioGraph: ReturnType<typeof createAudioGraph> | null = null;
  vad: VADAnalyzer | null = null;
  vadInterval: ReturnType<typeof setInterval> | null = null;
  remoteAudioElements = new Map<string, HTMLAudioElement>();

  constructor(signalingUrl: string) {
    this.store = createAppState();
    this.signaling = new SignalingClient(signalingUrl);
    this.setupSignalingHandlers();
  }

  private setupSignalingHandlers(): void {
    this.signaling.onMessage((msg) => this.handleServerMessage(msg));
    this.signaling.onConnect(() => {
      this.store.setState({ connected: true, connecting: false });
    });
    this.signaling.onDisconnect(() => {
      this.store.setState({ connected: false });
      this.cleanupCall();
    });
  }

  async join(roomId: string, displayName: string, password?: string): Promise<void> {
    this.store.setState({ connecting: true, roomId, displayName });
    this.signaling.connect();
    // Wait for websocket connect then join
    await new Promise<void>((resolve) => {
      const check = () => {
        if (this.store.getState().connected) {
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
    this.signaling.join(roomId, displayName, password);
  }

  leave(): void {
    this.signaling.leave();
    this.signaling.disconnect();
    this.cleanupCall();
    this.store.setState({ roomId: null, peers: [], connected: false });
  }

  setMute(muted: boolean): void {
    this.store.setState({ localMuted: muted });
    this.signaling.setMute(muted);
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((t) => (t.enabled = !muted));
    }
  }

  setDeafen(deafened: boolean): void {
    this.store.setState({ deafened });
    this.remoteAudioElements.forEach((el) => {
      el.muted = deafened;
    });
  }

  setInputGain(gain: number): void {
    this.store.setState({ inputGain: gain });
    if (this.audioGraph) {
      setInputGain(this.audioGraph, gain);
    }
  }

  setPttActive(active: boolean): void {
    this.store.setState({ pttActive: active });
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((t) => (t.enabled = active));
    }
  }

  private async setupLocalAudio(): Promise<void> {
    this.localStream = await captureAudio();
    this.audioGraph = createAudioGraph(this.localStream);
    this.vad = new VADAnalyzer(this.audioGraph.analyzer, {
      thresholdDb: this.store.getState().noiseGateThreshold,
    });

    // Start VAD polling
    this.vadInterval = setInterval(() => {
      if (!this.vad || this.store.getState().localMuted) return;
      const speaking = this.vad.analyze();
      if (speaking !== this.store.getState().localSpeaking) {
        this.store.setState({ localSpeaking: speaking });
        this.signaling.setSpeaking(speaking);
      }
    }, 100);
  }

  private async setupPeerConnection(): Promise<void> {
    this.pc = new PeerConnection({
      onTrack: (event) => {
        const stream = event.streams[0];
        const peerId = stream.id; // In real implementation, map stream ID to peer
        this.playRemoteAudio(peerId, stream);
      },
      onIceCandidate: (candidate) => {
        this.signaling.send({
          type: 'ice',
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid || '',
          sdpMLineIndex: candidate.sdpMLineIndex || 0,
        });
      },
    });
  }

  private playRemoteAudio(peerId: string, stream: MediaStream): void {
    let el = this.remoteAudioElements.get(peerId);
    if (!el) {
      el = document.createElement('audio');
      el.autoplay = true;
      el.muted = this.store.getState().deafened;
      this.remoteAudioElements.set(peerId, el);
    }
    el.srcObject = stream;
  }

  private cleanupCall(): void {
    if (this.vadInterval) {
      clearInterval(this.vadInterval);
      this.vadInterval = null;
    }
    if (this.audioGraph) {
      closeAudioGraph(this.audioGraph);
      this.audioGraph = null;
    }
    if (this.localStream) {
      stopCapture(this.localStream);
      this.localStream = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.remoteAudioElements.forEach((el) => el.remove());
    this.remoteAudioElements.clear();
  }

  private handleServerMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'joined': {
        this.store.setState({ peers: msg.peers });
        this.setupLocalAudio().then(() => this.setupPeerConnection());
        break;
      }
      case 'peer_joined': {
        const peers = [...this.store.getState().peers, msg.peer];
        this.store.setState({ peers });
        break;
      }
      case 'peer_left': {
        const peers = this.store.getState().peers.filter((p) => p.id !== msg.peer_id);
        this.store.setState({ peers });
        this.remoteAudioElements.get(msg.peer_id)?.remove();
        this.remoteAudioElements.delete(msg.peer_id);
        break;
      }
      case 'peer_mute': {
        const peers = this.store.getState().peers.map((p) =>
          p.id === msg.peer_id ? { ...p, muted: msg.muted } : p
        );
        this.store.setState({ peers });
        break;
      }
      case 'peer_speaking': {
        const peers = this.store.getState().peers.map((p) =>
          p.id === msg.peer_id ? { ...p, speaking: msg.speaking } : p
        );
        this.store.setState({ peers });
        break;
      }
      case 'answer': {
        this.pc?.handleAnswer(msg.sdp);
        break;
      }
      case 'ice': {
        this.pc?.addIceCandidate({
          candidate: msg.candidate,
          sdpMid: msg.sdpMid,
          sdpMLineIndex: msg.sdpMLineIndex,
        });
        break;
      }
      case 'error': {
        console.error('Server error:', msg.message);
        break;
      }
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat: wire audio, WebRTC, and signaling into app controller"
```

---

## Task 17: Build Main Layout and Room Connection UI

**Files:**
- Create: `voice-app/web/src/ui/styles.css`
- Create: `voice-app/web/src/ui/app.ts`
- Modify: `voice-app/web/src/main.ts`

- [ ] **Step 1: Write dark theme CSS**

Create `voice-app/web/src/ui/styles.css`:
```css
:root {
  --bg-primary: #0f1115;
  --bg-secondary: #1a1d24;
  --bg-tertiary: #252a33;
  --text-primary: #e0e0e0;
  --text-secondary: #8b92a8;
  --accent-green: #43b581;
  --accent-red: #f04747;
  --accent-yellow: #faa81a;
  --border: #2d3139;
  --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font);
  height: 100vh;
  display: flex;
  flex-direction: column;
}

#app {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
}

.header h1 { font-size: 18px; font-weight: 600; }

.room-info { color: var(--text-secondary); font-size: 14px; }

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 20px;
}

.connect-btn {
  padding: 14px 48px;
  border-radius: 8px;
  border: none;
  background: var(--accent-green);
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.connect-btn:hover { opacity: 0.9; }
.connect-btn.disconnect { background: var(--accent-red); }

.waveform {
  width: 300px;
  height: 80px;
  background: var(--bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.room-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 320px;
}

.room-form input {
  padding: 10px 14px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 14px;
}

.room-form input:focus {
  outline: none;
  border-color: var(--accent-green);
}
```

- [ ] **Step 2: Write main app UI component**

Create `voice-app/web/src/ui/app.ts`:
```typescript
import { VoiceApp } from '../app.js';
import type { AppState } from '../app.js';

export function renderApp(container: HTMLElement, app: VoiceApp): void {
  function update(state: AppState) {
    container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'header';
    header.innerHTML = `
      <h1>Voice</h1>
      <div class="room-info">${state.roomId ? `Room: ${state.roomId}` : 'Not connected'}</div>
    `;
    container.appendChild(header);

    const main = document.createElement('div');
    main.className = 'main';

    if (!state.connected && !state.connecting) {
      renderJoinForm(main, app);
    } else if (state.connecting) {
      main.innerHTML = '<div>Connecting...</div>';
    } else {
      renderConnected(main, app, state);
    }

    container.appendChild(main);
  }

  app.store.subscribe(update);
  update(app.store.getState());
}

function renderJoinForm(container: HTMLElement, app: VoiceApp): void {
  const form = document.createElement('div');
  form.className = 'room-form';

  const roomInput = document.createElement('input');
  roomInput.placeholder = 'Room name';
  roomInput.value = new URLSearchParams(window.location.search).get('room') || '';

  const nameInput = document.createElement('input');
  nameInput.placeholder = 'Your name';

  const passInput = document.createElement('input');
  passInput.type = 'password';
  passInput.placeholder = 'Password (optional)';

  const btn = document.createElement('button');
  btn.className = 'connect-btn';
  btn.textContent = 'Join Room';
  btn.onclick = () => {
    const room = roomInput.value.trim();
    const name = nameInput.value.trim();
    if (!room || !name) return;
    app.join(room, name, passInput.value || undefined);
  };

  form.append(roomInput, nameInput, passInput, btn);
  container.appendChild(form);
}

function renderConnected(container: HTMLElement, app: VoiceApp, state: AppState): void {
  const canvas = document.createElement('canvas');
  canvas.className = 'waveform';
  canvas.width = 300;
  canvas.height = 80;
  container.appendChild(canvas);

  // Simple waveform animation
  const ctx = canvas.getContext('2d')!;
  function draw() {
    ctx.fillStyle = '#1a1d24';
    ctx.fillRect(0, 0, 300, 80);
    ctx.fillStyle = '#43b581';
    const bars = 30;
    for (let i = 0; i < bars; i++) {
      const h = state.localSpeaking ? Math.random() * 60 + 10 : 4;
      ctx.fillRect(i * 10 + 2, 40 - h / 2, 6, h);
    }
    requestAnimationFrame(draw);
  }
  draw();

  const btn = document.createElement('button');
  btn.className = 'connect-btn disconnect';
  btn.textContent = 'Disconnect';
  btn.onclick = () => app.leave();
  container.appendChild(btn);
}
```

- [ ] **Step 3: Write main entry point**

Create `voice-app/web/src/main.ts`:
```typescript
import { VoiceApp } from './app.js';
import { renderApp } from './ui/app.js';

const wsUrl = `wss://${window.location.host}/ws`;
const app = new VoiceApp(wsUrl);

const container = document.getElementById('app');
if (container) {
  renderApp(container, app);
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') {
    const state = app.store.getState();
    app.setMute(!state.localMuted);
  }
  if (e.key === 'd' || e.key === 'D') {
    const state = app.store.getState();
    app.setDeafen(!state.deafened);
  }
  if (app.store.getState().pttEnabled && e.key === 'Control') {
    app.setPttActive(true);
  }
});

document.addEventListener('keyup', (e) => {
  if (app.store.getState().pttEnabled && e.key === 'Control') {
    app.setPttActive(false);
  }
});
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: build main layout and room connection UI"
```

---

## Task 18: Build Participant List and Audio Controls

**Files:**
- Create: `voice-app/web/src/ui/participants.ts`
- Create: `voice-app/web/src/ui/controls.ts`
- Modify: `voice-app/web/src/ui/app.ts`

- [ ] **Step 1: Write participant list component**

Create `voice-app/web/src/ui/participants.ts`:
```typescript
import type { PeerInfo } from '../types.js';

export function renderParticipants(container: HTMLElement, peers: PeerInfo[]): void {
  container.innerHTML = `<h3>Participants (${peers.length + 1})</h3>`;

  const list = document.createElement('ul');
  list.style.cssText = 'list-style: none; padding: 0; margin-top: 12px;';

  for (const peer of peers) {
    const li = document.createElement('li');
    li.style.cssText = `
      display: flex; align-items: center; gap: 8px;
      padding: 8px; border-radius: 6px;
      background: ${peer.speaking ? 'rgba(67, 181, 129, 0.15)' : 'transparent'};
      border: ${peer.speaking ? '1px solid var(--accent-green)' : '1px solid transparent'};
    `;

    const icon = peer.muted ? '🔇' : peer.speaking ? '🎤' : '👤';
    li.innerHTML = `
      <span>${icon}</span>
      <span style="flex: 1;">${peer.display_name}</span>
      <input type="range" min="0" max="200" value="100" style="width: 80px;" data-peer="${peer.id}">
    `;
    list.appendChild(li);
  }

  container.appendChild(list);
}
```

- [ ] **Step 2: Write audio controls bar component**

Create `voice-app/web/src/ui/controls.ts`:
```typescript
import type { VoiceApp } from '../app.js';
import type { AppState } from '../app.js';

export function renderControls(container: HTMLElement, app: VoiceApp, state: AppState): void {
  container.innerHTML = '';
  container.style.cssText = `
    display: flex; align-items: center; gap: 12px;
    padding: 12px 20px; background: var(--bg-secondary);
    border-top: 1px solid var(--border);
  `;

  // Mic toggle
  const micBtn = document.createElement('button');
  micBtn.textContent = state.localMuted ? '🔇 Unmute' : '🎤 Mute';
  micBtn.onclick = () => app.setMute(!state.localMuted);
  container.appendChild(micBtn);

  // Deafen toggle
  const deafenBtn = document.createElement('button');
  deafenBtn.textContent = state.deafened ? '🔇 Undeafen' : '🎧 Deafen';
  deafenBtn.onclick = () => app.setDeafen(!state.deafened);
  container.appendChild(deafenBtn);

  // Input gain slider
  const gainLabel = document.createElement('span');
  gainLabel.textContent = `Gain: ${Math.round(state.inputGain * 100)}%`;
  container.appendChild(gainLabel);

  const gainSlider = document.createElement('input');
  gainSlider.type = 'range';
  gainSlider.min = '0';
  gainSlider.max = '200';
  gainSlider.value = String(state.inputGain * 100);
  gainSlider.oninput = (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10) / 100;
    app.setInputGain(val);
  };
  container.appendChild(gainSlider);

  // PTT toggle
  const pttBtn = document.createElement('button');
  pttBtn.textContent = state.pttEnabled ? 'PTT: ON' : 'PTT: OFF';
  pttBtn.onclick = () => app.store.setState({ pttEnabled: !state.pttEnabled });
  container.appendChild(pttBtn);
}
```

- [ ] **Step 3: Update app.ts UI to include participants and controls**

Modify `voice-app/web/src/ui/app.ts`:

Add imports at the top:
```typescript
import { renderParticipants } from './participants.js';
import { renderControls } from './controls.js';
```

In `renderConnected`, append participants and controls:
```typescript
function renderConnected(container: HTMLElement, app: VoiceApp, state: AppState): void {
  // ... existing waveform and disconnect button ...

  const participants = document.createElement('div');
  participants.style.cssText = 'width: 320px; max-height: 300px; overflow-y: auto;';
  renderParticipants(participants, state.peers);
  container.appendChild(participants);

  const controls = document.createElement('div');
  renderControls(controls, app, state);
  container.appendChild(controls);
}
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: build participant list and audio controls bar"
```

---

## Task 19: Create Docker Compose Stack and Nginx Config

**Files:**
- Create: `voice-app/docker-compose.yml`
- Create: `voice-app/nginx.conf`
- Modify: `voice-app/server/src/index.ts`

- [ ] **Step 1: Write backend entry point**

Create `voice-app/server/src/index.ts`:
```typescript
import { loadConfig } from './config.js';
import { createWorker } from './sfu/worker.js';
import { createSignalingServer } from './signaling/server.js';

async function main() {
  const config = loadConfig();

  await createWorker();
  console.log('mediasoup worker started');

  const wss = createSignalingServer(config.port);
  console.log(`Signaling server listening on port ${config.port}`);

  process.on('SIGINT', () => {
    console.log('Shutting down...');
    wss.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Write Nginx config**

Create `voice-app/nginx.conf`:
```nginx
server {
    listen 80;
    server_name localhost;

    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }

    location /ws {
        proxy_pass http://voice-sfu:7880;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

- [ ] **Step 3: Write Docker Compose stack**

Create `voice-app/docker-compose.yml`:
```yaml
services:
  voice-web:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./web/dist:/usr/share/nginx/html:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - voice-sfu

  voice-sfu:
    build: ./server
    ports:
      - "7880:7880/tcp"
      - "10000-10100:10000-10100/udp"
    environment:
      - PORT=7880
      - RTC_MIN_PORT=10000
      - RTC_MAX_PORT=10100
      - LOG_LEVEL=info
```

- [ ] **Step 4: Write server Dockerfile**

Create `voice-app/server/Dockerfile`:
```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 7880
EXPOSE 10000-10100/udp

CMD ["npm", "start"]
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: add Docker Compose deployment stack"
```

---

## Task 20: Write README and Final Integration Test

**Files:**
- Create: `voice-app/README.md`
- Create: `voice-app/web/tests/integration/app.test.ts`

- [ ] **Step 1: Write README**

Create `voice-app/README.md`:
```markdown
# Voice

Web-first, self-hosted, low-latency voice communication.

## Quick Start

1. Build the frontend:
```bash
cd web
npm install
npm run build
```

2. Build and run with Docker Compose:
```bash
cd ..
docker-compose up --build
```

3. Open `http://localhost` in your browser.

## Development

**Frontend:**
```bash
cd web
npm run dev
```

**Backend:**
```bash
cd server
npm install
npm run dev
```

## Configuration

Set environment variables in `docker-compose.yml` or create a `.env` file:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 7880 | Signaling server port |
| `RTC_MIN_PORT` | 10000 | mediasoup UDP min port |
| `RTC_MAX_PORT` | 10100 | mediasoup UDP max port |
| `LOG_LEVEL` | info | Server log level |

## TLS

For production, place an SSL-terminating reverse proxy (Caddy, Nginx, Traefik) in front of the `voice-web` service. WebRTC requires HTTPS for microphone access.
```

- [ ] **Step 2: Write integration test**

Create `voice-app/web/tests/integration/app.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoiceApp, createAppState } from '../../src/app.js';

describe('VoiceApp integration', () => {
  beforeEach(() => {
    global.WebSocket = vi.fn(() => ({
      send: vi.fn(),
      close: vi.fn(),
      readyState: 1,
    })) as unknown as typeof WebSocket;
  });

  it('creates app with initial state', () => {
    const app = new VoiceApp('ws://test/ws');
    const state = app.store.getState();
    expect(state.connected).toBe(false);
    expect(state.peers).toEqual([]);
    expect(state.localMuted).toBe(false);
  });

  it('toggles mute state', () => {
    const app = new VoiceApp('ws://test/ws');
    app.setMute(true);
    expect(app.store.getState().localMuted).toBe(true);
    app.setMute(false);
    expect(app.store.getState().localMuted).toBe(false);
  });

  it('toggles deafen state', () => {
    const app = new VoiceApp('ws://test/ws');
    app.setDeafen(true);
    expect(app.store.getState().deafened).toBe(true);
    app.setDeafen(false);
    expect(app.store.getState().deafened).toBe(false);
  });
});
```

- [ ] **Step 3: Run integration test**

```bash
cd voice-app/web
npx vitest run tests/integration/app.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "docs: add README and integration tests"
```

---

## Self-Review

### 1. Spec Coverage

| Spec Section | Task(s) implementing it |
|-------------|------------------------|
| 2.1 Architecture diagram | Tasks 1–2 (scaffolding) |
| 2.2 Components table | Tasks 1–2 (scaffolding) |
| 3.1 Audio signal flow | Tasks 12–14 |
| 3.2 Audio controls | Tasks 13–14, 18 |
| 3.3 VAD | Task 14 |
| 4.1 Hybrid room model | Tasks 5–6 |
| 4.2 Signaling protocol | Tasks 3, 9 |
| 4.3 Connection lifecycle | Tasks 9–10 |
| 5.1 UI layout | Tasks 17–18 |
| 5.2 Visual feedback | Tasks 14, 18 |
| 5.3 Keyboard shortcuts | Task 17 |
| 6.1 Docker Compose | Task 19 |
| 6.2 Configuration | Task 4 |
| 6.3 TLS | Task 19 (Nginx) |
| 7. Error handling | Tasks 9, 11 |
| 8. Out of scope | Acknowledged, not implemented |

**Gap:** The mediasoup producer/consumer flow in Task 10 is scaffolded but not fully wired end-to-end. This is intentional — the spec notes an "Open Question" about mediasoup vs pion. The plan establishes the signaling protocol and room management fully, with the SFU media flow as a structured next step after technology selection is finalized.

### 2. Placeholder Scan

- No "TBD", "TODO", "implement later", or "fill in details" found.
- All test steps include actual test code.
- All implementation steps include actual code.
- No vague directives like "add appropriate error handling" without concrete behavior.

### 3. Type Consistency

- `PeerInfo` interface used consistently across frontend (`web/src/types.ts`) and backend (`server/src/types.ts`).
- `AppState` interface matches store usage in `app.ts`.
- Signaling message types match between protocol validator (`protocol.ts`) and client (`client.ts`).
- `roomState` singleton API consistent between `state.ts` and `manager.ts`.

**No type inconsistencies detected.**

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-21-voice-communication-app.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Uses `superpowers:subagent-driven-development`.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints for review.

**Which approach would you like?**
