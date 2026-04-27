# Chat Redesign: Collapsible Bar + Dropdown Panel + Activity Log

> **Date:** 2026-04-27
> **Status:** Draft — pending review

---

## 1. Overview

Replace the existing hidden chat panel with a **persistent preview bar** positioned above the voice orb. The bar shows the latest message and expands into a dropdown panel revealing the full chat history, input field, and inline activity log.

**Current state:** A `.chat-panel` exists in the DOM but is hidden with `display: none !important`. This design removes that hidden panel and replaces it with the new bar + dropdown component.

---

## 2. Goals

- Make chat discoverable without cluttering the voice UI
- Show the latest message at a glance
- Provide a quick way to open/close the full chat
- Add room activity log (joins, leaves, mutes, kicks, ownership changes)
- Maintain touch-friendliness and keyboard accessibility

---

## 3. Layout & Positioning

### 3.1 Collapsed Bar (Default State)

The bar sits **above the orb** in the connected screen, centered horizontally.

```
┌─────────────────────────────┐
│  💬 Alice: hey guys  ▼      │  ← Chat bar (44px height)
├─────────────────────────────┤
│                             │
│         ◉  ORB              │  ← Voice UI unchanged
│                             │
└─────────────────────────────┘
```

**Dimensions:**
- Height: `44px`
- Width: `min(400px, 90vw)` — capped at 400px, responsive down to 90% of viewport
- Max-width: `400px`

**Content (left to right):**
1. **Chat icon** (💬 SVG, 18px, `var(--text-secondary)`)
2. **Latest message preview** — `"<Name>: <text>"` truncated with ellipsis
   - If no messages: `"No messages yet"` in `var(--text-muted)`
3. **Down chevron** (▼ SVG, 14px, `var(--text-muted)`)

**Styling:**
- Background: `var(--bg-glass)` with `backdrop-filter: blur(12px)`
- Border: `1px solid var(--border-subtle)`
- Border-radius: `12px`
- Padding: `0 14px`
- Font: `13px var(--font-display)`, `var(--text-primary)`
- Cursor: `pointer`

**New message indicator:**
- When a new message arrives while collapsed, the right edge of the bar pulses with a brief amber glow (`box-shadow: 0 0 8px var(--accent-amber)` for 1.5s)
- The glow clears when the bar is expanded

### 3.2 Expanded Dropdown Panel

Clicking the bar expands a dropdown panel directly beneath it.

```
┌─────────────────────────────┐
│  💬 Alice: hey guys  ▲      │  ← Bar (now header, same styling)
├─────────────────────────────┤
│  Alice        14:32         │
│  hey guys                   │
│                             │
│  • Bob joined the room      │  ← System message (activity log)
│                             │
│  [Type a message...] [Send] │  ← Input row
├─────────────────────────────┤
│         ◉  ORB              │
└─────────────────────────────┘
```

**Dimensions:**
- Width: matches the bar (`min(400px, 90vw)`)
- Height: `320px` max-height
- Position: absolute, directly below the bar
- Z-index: above the orb but below modals

**Structure (top to bottom):**
1. **Message list** (`flex: 1`, `overflow-y: auto`)
   - Chat messages + system messages interleaved
   - Padding: `12px 16px`
   - Gap between messages: `10px`
2. **Input row** (fixed at bottom)
   - Same as current: text input + send button
   - Border-top: `1px solid var(--border-subtle)`

**Close triggers:**
- Click the up chevron (▲) in the bar
- Click outside the panel (document-level tap listener)
- Press `Escape` twice (first blurs input, second closes panel)

**Auto-scroll behavior:**
- When panel opens: scroll to bottom
- While at bottom: auto-scroll on new messages
- If user scrolls up: pause auto-scroll, show a "New messages" badge
- Resume auto-scroll when user scrolls back to bottom

---

## 4. Message Types

### 4.1 Chat Message (Existing)

No changes to the existing chat message structure or rendering.

```typescript
interface ChatMessage {
  type: 'chat';
  peer_id: string;
  text: string;
  timestamp: number;
}
```

**Rendering:**
- Name + timestamp header (same as current)
- Body text (same as current)

### 4.2 System Message (New)

System messages are generated client-side from server events and appended to the same `messages` array.

```typescript
interface SystemMessage {
  type: 'system';
  event: 'peer_joined' | 'peer_left' | 'peer_mute' | 'peer_force_muted' | 'kicked' | 'ownership_changed';
  peer_id: string;      // subject of the event
  actor_id?: string;    // who performed the action (e.g., kicker)
  timestamp: number;
}
```

**Event → message mapping:**

| Event | Display Text |
|-------|-------------|
| `peer_joined` | `Alice joined the room` |
| `peer_left` | `Alice left the room` |
| `peer_mute` (muted=true) | `Alice muted themselves` |
| `peer_mute` (muted=false) | `Alice unmuted` |
| `peer_force_muted` | `Alice was force-muted` |
| `kicked` | `Alice was kicked by Bob` |
| `ownership_changed` | `Alice is now the room owner` |

**Rendering:**
- Centered text, `11px`, `var(--text-muted)`, italic
- Prefix with a small dot (•) or dash (—)
- No name/timestamp header
- No background/bubble

---

## 5. Server Protocol Changes

**No server changes needed for text chat** — existing `chat` message type and rate limiting remain.

**Client-side change:** The web client already receives `peer_joined`, `peer_left`, `peer_mute`, `peer_force_muted`, `kicked`, and `ownership_changed` events. The change is to convert these into `SystemMessage` objects and append them to the `messages` array, rather than only updating peer state.

---

## 6. Web State Changes

### 6.1 Message Store Update

The `AppState.messages` array currently holds `{ peer_id, text, timestamp }`. Update to a union type:

```typescript
// web/src/app.ts
interface ChatMessageEntry {
  type: 'chat';
  peer_id: string;
  text: string;
  timestamp: number;
}

interface SystemMessageEntry {
  type: 'system';
  event: 'peer_joined' | 'peer_left' | 'peer_mute' | 'peer_force_muted' | 'kicked' | 'ownership_changed';
  peer_id: string;
  actor_id?: string;
  timestamp: number;
}

type MessageEntry = ChatMessageEntry | SystemMessageEntry;
```

Update `AppState`:
```typescript
messages: MessageEntry[];
```

### 6.2 Message Handlers

In the WebSocket message handler (`web/src/app.ts`), for each server event that should be logged:

```typescript
case 'peer_joined': {
  // existing: add peer to state.peers
  // new: append system message
  this.store.setState({
    messages: [...state.messages, {
      type: 'system',
      event: 'peer_joined',
      peer_id: msg.peer.id,
      timestamp: Date.now(),
    }],
  });
  break;
}
// Similar for peer_left, peer_mute, peer_force_muted, kicked, ownership_changed
```

---

## 7. UI Component Changes

### 7.1 Files to Modify

| File | Changes |
|------|---------|
| `web/src/ui/app.ts` | Replace `chatPanel` rendering with new bar + dropdown; add expand/collapse logic; add outside-click handler |
| `web/src/ui/styles.css` | Remove old `.chat-panel` styles; add `.chat-bar`, `.chat-dropdown`, `.chat-system-message` styles |
| `web/src/app.ts` | Update `messages` type to `MessageEntry[]`; add system message generation in WS handlers |
| `web/src/types.ts` | Add `SystemMessageEntry` type (or keep local to `app.ts` if not needed externally) |

### 7.2 New DOM Structure (Connected Screen)

```html
<div class="connected-layout">
  <div class="chat-bar">
    <span class="chat-bar-icon">💬</span>
    <span class="chat-bar-preview">Alice: hey guys</span>
    <span class="chat-bar-chevron">▼</span>
  </div>
  <div class="chat-dropdown" style="display: none;">
    <div class="chat-messages">
      <!-- messages rendered here -->
    </div>
    <div class="chat-input-wrap">
      <input class="chat-input" placeholder="Type a message...">
      <button class="chat-send-btn">Send</button>
    </div>
  </div>
  <div class="orb-container">...</div>
</div>
```

### 7.3 CSS (New Classes)

```css
.chat-bar {
  height: 44px;
  width: min(400px, 90vw);
  max-width: 400px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  background: var(--bg-glass);
  backdrop-filter: blur(12px);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  cursor: pointer;
  user-select: none;
  transition: box-shadow 0.3s ease;
}

.chat-bar-preview {
  flex: 1;
  font-size: 13px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-bar-preview.empty {
  color: var(--text-muted);
}

.chat-bar.new-message {
  animation: chat-bar-glow 1.5s ease-out;
}

@keyframes chat-bar-glow {
  0% { box-shadow: 0 0 0 0 var(--accent-amber); }
  50% { box-shadow: 0 0 12px 2px var(--accent-amber); }
  100% { box-shadow: 0 0 0 0 transparent; }
}

.chat-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  width: 100%;
  max-height: 320px;
  display: flex;
  flex-direction: column;
  background: var(--bg-glass);
  backdrop-filter: blur(12px);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  overflow: hidden;
  z-index: 10;
}

.chat-system-message {
  text-align: center;
  font-size: 11px;
  font-style: italic;
  color: var(--text-muted);
  padding: 4px 0;
}

.chat-system-message::before {
  content: '• ';
}
```

---

## 8. Touch & Keyboard

### 8.1 Touch

- Bar height `44px` = comfortable tap target
- Panel closes on tap outside (document listener, cleaned up on unmount)
- Input row send button already touch-friendly (`padding: 8px 14px`)

### 8.2 Keyboard

- `Enter` in input sends message (existing)
- `Escape` while input focused → blur input
- `Escape` while panel open (input not focused) → close panel
- Global shortcuts (P, M, D) still work when panel is closed
- When input is focused, global shortcuts are suppressed (existing `isInputFocused()` check)

---

## 9. Edge Cases

| Scenario | Behavior |
|----------|----------|
| Very long message | Preview truncated with ellipsis; full text visible in panel |
| Empty chat | Preview shows `"No messages yet"` |
| Message with no name (peer left) | Shows `"Unknown"` |
| User scrolls up in panel | Auto-scroll pauses; "New messages" badge appears |
| Panel open, user switches screen | Panel closes automatically (screen change triggers re-render) |
| Mobile landscape | Bar width caps at `90vw`, panel respects max-height |

---

## 10. Testing Plan

1. **Unit tests** (existing test framework):
   - Send chat message → appears in preview bar
   - Expand panel → shows message history
   - Close panel → click outside, click chevron, press Escape
   - Peer joins → system message appears
   - Peer leaves → system message appears

2. **Manual tests:**
   - Touch: tap bar to expand, tap outside to close
   - Keyboard: Enter to send, Escape to close
   - Auto-scroll: send multiple messages, scroll up, verify pause/resume

---

## 11. Migration Notes

- Remove the existing `.chat-panel` CSS rules (currently `display: none !important`)
- The existing `ChatMessage` type in `web/src/types.ts` is the server protocol type; the web app's internal message store can use a different type or extend it
- Server protocol remains unchanged — all system messages are generated client-side from existing server events

---

## 12. Open Questions

1. Should the activity log include **all** mute/unmute events, or only force-mutes?
2. Should kicked users see the `"Alice was kicked by Bob"` message before being disconnected?
3. Should the bar show a **message count badge** (e.g., "💬 3") when collapsed and new messages arrive?

---

*End of spec.*
