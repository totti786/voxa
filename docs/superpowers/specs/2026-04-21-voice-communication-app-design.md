# Voice Communication App — Design Spec

**Date:** 2026-04-21  
**Topic:** Web-first, self-hosted, low-latency voice communication (Mumble-inspired)  
**Status:** Draft — awaiting review

---

## 1. Goals & Success Criteria

### Primary Goal
Build a web-first, self-hosted voice communication app optimized for **low latency**, **high audio quality**, and **minimal friction** (click link → talking in <3 seconds).

### Success Criteria
- End-to-end latency < 150ms under normal network conditions.
- Clean audio with built-in noise suppression, echo cancellation, and noise gating.
- Supports 2–10 concurrent users per room with consistent quality.
- Self-hostable via Docker Compose on a low-cost VPS or home server.
- Works in modern browsers without plugins or downloads.
- Zero account requirement for quick rooms.

---

## 2. Architecture Overview

### 2.1 High-Level Pattern

```
┌─────────────────┐         ┌──────────────────────────────────┐
│   Browser SPA   │         │         Self-Hosted Server        │
│  (WebRTC client)│◄───────►│  ┌──────────┐    ┌──────────┐  │
│                 │  WSS    │  │ Signaling │◄──►│ Audio SFU│  │
│  getUserMedia   │         │  │  (WS)    │    │          │  │
│  Web Audio API  │         │  └──────────┘    └──────────┘  │
│  RTCPeerConnection│       │         ▲                        │
└─────────────────┘         │    ┌────┴────┐                   │
                            │    │  Room   │                   │
                            │    │  State  │                   │
                            │    │(in-mem) │                   │
                            │    └─────────┘                   │
                            └──────────────────────────────────┘
```

### 2.2 Components

| Component | Technology | Responsibility |
|-----------|-----------|----------------|
| **Web Client** | Vanilla TypeScript + SPA | Capture, local audio processing, WebRTC peer connection, UI |
| **Signaling Server** | Node.js or Go + WebSocket | Room management, peer discovery, SDP/ICE relay |
| **Audio SFU** | Node.js (mediasoup) or Go (pion/webrtc) | Receive single upstream audio track, forward N-1 downstream tracks |
| **Static Web Host** | Nginx | Serve built SPA assets |
| **TURN Server** (optional) | coturn | NAT traversal for restrictive networks |

### 2.3 Why Audio SFU over Mesh

For 2–10 users, a mesh topology causes upload bandwidth to scale as O(n²). At 10 users with Opus at 64kbps, each peer uploads ~576kbps — exceeding many consumer upload limits. An audio SFU caps upload at O(1) (~64kbps per client) while adding negligible latency (<20ms server hop). This ensures consistent quality across all group sizes in the target range.

---

## 3. Audio Pipeline

### 3.1 Signal Flow

```
Mic Input
    ↓
getUserMedia({ echoCancellation: true, noiseSuppression: true, autoGainControl: true })
    ↓
Web Audio API Graph:
  ├─ Noise Gate (configurable dB threshold)
  ├─ Compressor (smooth dynamic range)
  └─ AnalyserNode (real-time VU meter / speaking detection)
    ↓
MediaStreamTrack → RTCPeerConnection → Opus encoder (browser) → SFU
    ↓
SFU forwards to all other peers
    ↓
Browser decodes Opus → Web Audio API destination (speakers/headphones)
```

### 3.2 Audio Controls

| Control | Type | Default |
|---------|------|---------|
| Input device | Dropdown | System default |
| Output device | Dropdown | System default |
| Input gain / sensitivity | Slider (0–200%) | 100% |
| Noise gate threshold | Slider (-70dB to -20dB) | -45dB |
| Per-user volume | Slider (0–200%) | 100% |
| Master output volume | Slider (0–100%) | 80% |
| Microphone mode | Toggle: VAD / Push-to-Talk | VAD |
| Push-to-talk key | Key capture | Ctrl |

### 3.3 Voice Activity Detection (VAD)

- Use `AnalyserNode.getByteFrequencyData()` to compute RMS volume.
- Mark user as "speaking" when RMS exceeds noise gate threshold + 6dB hysteresis.
- Mute mic stream (`track.enabled = false`) when in push-to-talk release state.
- Signal speaking/muted state to server via WebSocket for UI indicators.

---

## 4. Room Model & Signaling

### 4.1 Hybrid Room Model

**Quick Rooms (default):**
- URL pattern: `https://host/r/{room-name}`
- Room created on first `join` if it doesn't exist.
- No user accounts required.
- Room destroyed when last peer leaves.
- Optional password set via UI prompt. (Avoid query params to prevent password exposure in browser history.)

**Persistent Rooms (future, optional):**
- Defined in server config (`rooms.yml` or env vars).
- Support admin-defined passwords and max user limits.
- Exist independently of occupancy.

### 4.2 WebSocket Signaling Protocol

All messages are JSON over WebSocket.

**Client → Server:**
```json
{ "type": "join", "room": "room-name", "password": "optional", "display_name": "Alice" }
{ "type": "offer", "sdp": "...", "room": "room-name" }
{ "type": "ice", "candidate": "...", "sdpMid": "...", "sdpMLineIndex": 0 }
{ "type": "mute", "muted": true }
{ "type": "speaking", "speaking": true }
{ "type": "leave" }
```

**Server → Client:**
```json
{ "type": "joined", "peers": [{"id":"...","display_name":"...","muted":false}] }
{ "type": "peer_joined", "peer": {"id":"...","display_name":"..."} }
{ "type": "peer_left", "peer_id": "..." }
{ "type": "answer", "sdp": "..." }
{ "type": "ice", "candidate": "..." }
{ "type": "peer_mute", "peer_id": "...", "muted": true }
{ "type": "peer_speaking", "peer_id": "...", "speaking": true }
{ "type": "error", "message": "..." }
```

### 4.3 Connection Lifecycle

1. Client opens WebSocket to `wss://host/ws` (proxied by Nginx to the SFU signaling service).
2. Client sends `join` with room name.
3. Server replies `joined` with current peer list.
4. Client creates `RTCPeerConnection` with audio `sendonly` transceiver.
5. Client generates offer, sends to server.
6. Server (SFU) creates answer, starts forwarding existing peers' audio tracks as `recvonly` transceivers.
7. ICE exchange completes.
8. When new peer joins, SFU adds a new `MediaStreamTrack` to existing peer connections and fires `track` event.
9. When peer leaves, SFU removes the track and signals `peer_left`.

---

## 5. UI/UX Design

### 5.1 Layout

**Single-page app, dark theme, minimal chrome.**

```
┌──────────────────────────────────────────────────────────────┐
│  [Logo]  Room: gaming-squad              [Settings] [Leave]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                                                              │
│                     [Connect / Disconnect]                   │
│                                                              │
│                     [Audio Waveform Visualizer]              │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  [Mic Toggle] [Input: ▼] [Output: ▼] [Gain] [Noise Gate]   │
├──────────────────────────────────────────────────────────────┤
│  Participants (3)                                            │
│  ├─ 🎤 Alice        [||||||] [Vol: ████████░░]              │
│  ├─ 🔇 Bob          [      ] [Vol: ██████████]              │
│  └─ 🎤 You          [||||  ] [Vol: ████████░░] [Config]     │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 Visual Feedback

- **Speaking indicator:** Green border + subtle glow around active speaker's avatar/card.
- **Muted indicator:** Red mic-slash icon.
- **Self-monitoring:** Real-time waveform visualizer so users know their mic works before speaking.
- **Connection status:** Small dot (green/yellow/red) indicating WebRTC connection health.

### 5.3 Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl` (hold) | Push-to-Talk (when PTT mode enabled) |
| `M` | Toggle mute |
| `D` | Toggle deafen (mute output) |
| `Esc` | Close settings modal |

---

## 6. Deployment & Self-Hosting

### 6.1 Docker Compose Stack

```yaml
services:
  voice-web:
    image: nginx:alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./web/dist:/usr/share/nginx/html:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
    # Nginx config must proxy /ws to voice-sfu:7880 for WebSocket signaling

  voice-sfu:
    build: ./server
    ports: ["7880:7880/tcp", "10000-10100:10000-10100/udp"]
    environment:
      - PORT=7880
      - RTC_MIN_PORT=10000
      - RTC_MAX_PORT=10100
      - LOG_LEVEL=info

  # Optional — only needed for users behind restrictive NAT
  voice-turn:
    image: coturn/coturn
    ports: ["3478:3478/tcp", "3478:3478/udp", "5349:5349/tcp"]
    environment:
      - TURN_SERVER_NAME=voice-turn
      - TURN_REALM=example.com
      - TURN_SECRET=change-me-in-production
```

### 6.2 Configuration

Server reads from environment variables or a single `config.yml`:

```yaml
server:
  port: 7880
  rtc_min_port: 10000
  rtc_max_port: 10100
  log_level: info

rooms:
  # Optional persistent rooms
  - id: admin-channel
    password: secret123
    max_users: 10

turn:
  enabled: true
  server: "turn:turn.example.com:3478"
  username: "user"
  credential: "pass"
```

### 6.3 TLS

Recommended: terminate TLS at a reverse proxy (Caddy or Nginx) with automatic Let's Encrypt certificates. WebRTC requires `https://` for `getUserMedia()`.

---

## 7. Error Handling & Edge Cases

| Scenario | Behavior |
|----------|----------|
| Mic permission denied | Show inline error, offer manual device selection, link to browser settings help. |
| WebSocket disconnect | Attempt exponential backoff reconnection (1s, 2s, 4s, 8s). Show "Reconnecting..." overlay. |
| SFU ICE failure | Fall back to TURN server if configured. If no TURN, show "Network incompatible" message. |
| Room full | Reject `join` with `"error": "room_full"`. Client shows friendly message. |
| Wrong password | Reject `join` with `"error": "wrong_password"`. Client shows password prompt. |
| Browser not supported | Detect lack of `RTCPeerConnection` or `getUserMedia` on load. Show unsupported browser message. |

---

## 8. Out of Scope (for initial build)

- Mobile native apps (web app should work on mobile browsers, but not optimized).
- Video / screen sharing.
- Persistent user accounts or authentication beyond room passwords.
- Admin dashboards or room management UI.
- Recording or broadcast outputs.
- End-to-end encryption (relies on DTLS-SRTP from WebRTC; no additional app-level encryption).

---

## 9. Technology Choices Summary

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend | Vanilla TypeScript (or Vite + minimal framework) | Low overhead, full control over Web Audio API and WebRTC. Avoid framework bloat for a single-purpose app. |
| SFU/Signaling | Node.js + mediasoup | Mature, well-documented, excellent audio handling, active community. Alternative: Go + pion if lower resource usage is critical. |
| Web Server | Nginx | Standard, proven, easy TLS termination. |
| TURN | coturn | Industry standard, trivial to run in Docker. |
| Build Tool | Vite | Fast dev server, simple production builds for SPA. |
| Container | Docker + Docker Compose | Universal self-hosting standard. |

---

## 10. Open Questions / Future Considerations

1. **SFU technology:** Final decision between mediasoup (Node.js) and pion (Go) pending prototype benchmarking for CPU/memory usage at 10 users.
2. **Persistent room storage:** If persistent rooms are implemented later, evaluate Redis vs SQLite for room state persistence.
3. **Metrics/observability:** Consider adding Prometheus metrics endpoint to the SFU for self-hosters who want monitoring.

---

*Spec written by Sisyphus brainstorming agent. Review before proceeding to implementation planning.*
