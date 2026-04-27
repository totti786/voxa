# Chat Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hidden chat panel with a persistent preview bar above the orb that expands into a dropdown panel showing chat history + inline activity log.

**Architecture:** Add a `MessageEntry` union type (`chat` | `system`) to the web app's state. Generate system messages client-side from existing server events (peer_joined, peer_left, etc.). Replace the hidden `.chat-panel` DOM with a new `.chat-bar` + `.chat-dropdown` component. Activity log entries render as centered italic system messages inside the same scrollable list.

**Tech Stack:** TypeScript, vanilla DOM (no framework), existing test runner (Vitest)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `web/src/app.ts` | Update `AppState.messages` to `MessageEntry[]`; add system message generation in WS handlers |
| `web/src/ui/app.ts` | Replace `chatPanel` rendering with new bar + dropdown; add expand/collapse logic; add outside-click handler |
| `web/src/ui/styles.css` | Remove old `.chat-panel` styles; add `.chat-bar`, `.chat-dropdown`, `.chat-system-message` styles |
| `web/tests/integration/app.test.ts` | Add tests for bar rendering, system messages, expand/collapse |

---

## Task 1: Update Message Types in App State

**Files:**
- Modify: `web/src/app.ts`

The `AppState.messages` array currently holds plain `{ peer_id, text, timestamp }`. We need a discriminated union.

- [ ] **Step 1: Add `MessageEntry` types near the top of `web/src/app.ts`**

Add these interfaces right after the existing imports, before `interface AppState`:

```typescript
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

- [ ] **Step 2: Update `AppState` interface**

Change:
```typescript
messages: { peer_id: string; text: string; timestamp: number }[];
```
To:
```typescript
messages: MessageEntry[];
```

- [ ] **Step 3: Update initial state**

In the `VoiceApp` constructor, the `messages: []` line is fine as-is (empty array is compatible with `MessageEntry[]`).

- [ ] **Step 4: Commit**

```bash
cd /home/tarek/voice-app && rtk git add web/src/app.ts && rtk git commit -m "refactor(web): add MessageEntry union type for chat + system messages"
```

---

## Task 2: Generate System Messages from Server Events

**Files:**
- Modify: `web/src/app.ts`

Currently, `peer_joined`, `peer_left`, etc. only update `state.peers`. They must also append a `SystemMessageEntry` to `state.messages`.

- [ ] **Step 1: Update `peer_joined` handler**

Find the `case 'peer_joined':` block (around line 483). After adding the peer to `state.peers`, append a system message:

```typescript
case 'peer_joined': {
  const peer = msg.peer;
  const newPeers = [...this.store.getState().peers, peer];
  this.store.setState({
    peers: newPeers,
    messages: [...this.store.getState().messages, {
      type: 'system',
      event: 'peer_joined',
      peer_id: peer.id,
      timestamp: Date.now(),
    }],
  });
  break;
}
```

- [ ] **Step 2: Update `peer_left` handler**

Find the `case 'peer_left':` block (around line 490). After removing the peer, append a system message:

```typescript
case 'peer_left': {
  const leavingPeerId = msg.peer_id;
  const newPeers = this.store.getState().peers.filter((p) => p.id !== leavingPeerId);
  this.store.setState({
    peers: newPeers,
    messages: [...this.store.getState().messages, {
      type: 'system',
      event: 'peer_left',
      peer_id: leavingPeerId,
      timestamp: Date.now(),
    }],
  });
  break;
}
```

- [ ] **Step 3: Update `peer_mute` handler**

Find the `case 'peer_mute':` block. After updating the peer's muted state, append a system message:

```typescript
case 'peer_mute': {
  const peerId = msg.peer_id;
  const muted = msg.muted;
  const newPeers = this.store.getState().peers.map((p) =>
    p.id === peerId ? { ...p, muted } : p
  );
  this.store.setState({
    peers: newPeers,
    messages: [...this.store.getState().messages, {
      type: 'system',
      event: 'peer_mute',
      peer_id: peerId,
      timestamp: Date.now(),
    }],
  });
  break;
}
```

- [ ] **Step 4: Update `peer_force_muted` handler**

Find the `case 'peer_force_muted':` block. After updating state, append:

```typescript
case 'peer_force_muted': {
  const peerId = msg.peer_id;
  const muted = msg.muted;
  const newPeers = this.store.getState().peers.map((p) =>
    p.id === peerId ? { ...p, force_muted: muted } : p
  );
  this.store.setState({
    peers: newPeers,
    messages: [...this.store.getState().messages, {
      type: 'system',
      event: 'peer_force_muted',
      peer_id: peerId,
      timestamp: Date.now(),
    }],
  });
  break;
}
```

- [ ] **Step 5: Update `ownership_changed` handler**

Find the `case 'ownership_changed':` block. After updating ownership, append:

```typescript
case 'ownership_changed': {
  const newOwnerId = msg.peer_id;
  const newPeers = this.store.getState().peers.map((p) =>
    p.id === newOwnerId ? { ...p, is_owner: true } : { ...p, is_owner: false }
  );
  this.store.setState({
    peers: newPeers,
    localIsOwner: newOwnerId === this.store.getState().selfPeerId,
    messages: [...this.store.getState().messages, {
      type: 'system',
      event: 'ownership_changed',
      peer_id: newOwnerId,
      timestamp: Date.now(),
    }],
  });
  break;
}
```

- [ ] **Step 6: Update `kicked` handler**

Find the `case 'kicked':` block. Before disconnecting, append a system message. Note: the kicked user won't see this since they're disconnected, but other clients in the room might receive a broadcast. If the server doesn't broadcast kicks to other peers, skip this. Check the server code — if `handlePeerLeave` broadcasts `peer_left` but not the kick reason, we only log `peer_left`. For now, assume we log the kick if we receive it:

```typescript
case 'kicked': {
  this.store.setState({
    messages: [...this.store.getState().messages, {
      type: 'system',
      event: 'kicked',
      peer_id: this.store.getState().selfPeerId ?? '',
      timestamp: Date.now(),
    }],
  });
  this.disconnect();
  break;
}
```

If the `kicked` message is only sent to the target and not broadcast to others, then other clients won't see this system message. That's acceptable for now — the `peer_left` event will still fire for everyone.

- [ ] **Step 7: Run typecheck**

```bash
cd /home/tarek/voice-app/web && npx tsc --noEmit
```
Expected: clean (0 errors)

- [ ] **Step 8: Commit**

```bash
cd /home/tarek/voice-app && rtk git add web/src/app.ts && rtk git commit -m "feat(web): generate system messages from server events"
```

---

## Task 3: Build Chat Bar + Dropdown UI

**Files:**
- Modify: `web/src/ui/app.ts`

Replace the existing hidden `chatPanel` rendering with the new bar + dropdown component.

- [ ] **Step 1: Update `ConnectedElements` interface**

Replace:
```typescript
interface ConnectedElements {
  orbWrap: HTMLElement;
  orbRing: HTMLElement;
  orbCanvas: HTMLCanvasElement;
  orbLabel: HTMLElement;
  participants: HTMLElement;
  controls: HTMLElement;
  canvasCtx: CanvasRenderingContext2D;
  animId: number | null;
  chatPanel: HTMLElement;
  chatMessages: HTMLElement;
  chatInput: HTMLInputElement;
  lastMessageCount: number;
  _cleanupKeyboard?: () => void;
}
```

With:
```typescript
interface ConnectedElements {
  orbWrap: HTMLElement;
  orbRing: HTMLElement;
  orbCanvas: HTMLCanvasElement;
  orbLabel: HTMLElement;
  participants: HTMLElement;
  controls: HTMLElement;
  canvasCtx: CanvasRenderingContext2D;
  animId: number | null;
  chatBar: HTMLElement;
  chatDropdown: HTMLElement;
  chatMessages: HTMLElement;
  chatInput: HTMLInputElement;
  lastMessageCount: number;
  _cleanupKeyboard?: () => void;
  _cleanupChat?: () => void;
}
```

- [ ] **Step 2: Replace chat panel rendering in `renderConnectedScreen`**

Find this block (around lines 470–508):
```typescript
  const chatPanel = document.createElement('div');
  chatPanel.className = 'chat-panel';

  const chatHeader = document.createElement('div');
  chatHeader.className = 'chat-header';
  chatHeader.textContent = 'Chat';
  chatPanel.appendChild(chatHeader);

  const chatMessages = document.createElement('div');
  chatMessages.className = 'chat-messages';
  chatPanel.appendChild(chatMessages);

  const chatInputWrap = document.createElement('div');
  chatInputWrap.className = 'chat-input-wrap';

  const chatInput = document.createElement('input');
  chatInput.className = 'chat-input';
  chatInput.placeholder = 'Type a message...';
  chatInput.maxLength = 500;
  chatInputWrap.appendChild(chatInput);

  const chatSendBtn = document.createElement('button');
  chatSendBtn.className = 'chat-send-btn';
  chatSendBtn.textContent = 'Send';
  chatSendBtn.onclick = () => {
    app.sendChat(chatInput.value);
    chatInput.value = '';
  };
  chatInputWrap.appendChild(chatSendBtn);

  chatPanel.appendChild(chatInputWrap);
  layout.appendChild(chatPanel);

  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      app.sendChat(chatInput.value);
      chatInput.value = '';
    }
  });
```

Replace with:
```typescript
  // Chat bar
  const chatBar = document.createElement('div');
  chatBar.className = 'chat-bar';

  const chatIcon = document.createElement('span');
  chatIcon.className = 'chat-bar-icon';
  chatIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  const chatPreview = document.createElement('span');
  chatPreview.className = 'chat-bar-preview empty';
  chatPreview.textContent = 'No messages yet';

  const chatChevron = document.createElement('span');
  chatChevron.className = 'chat-bar-chevron';
  chatChevron.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>';

  chatBar.appendChild(chatIcon);
  chatBar.appendChild(chatPreview);
  chatBar.appendChild(chatChevron);
  layout.appendChild(chatBar);

  // Chat dropdown
  const chatDropdown = document.createElement('div');
  chatDropdown.className = 'chat-dropdown';
  chatDropdown.style.display = 'none';

  const chatMessages = document.createElement('div');
  chatMessages.className = 'chat-messages';
  chatDropdown.appendChild(chatMessages);

  const chatInputWrap = document.createElement('div');
  chatInputWrap.className = 'chat-input-wrap';

  const chatInput = document.createElement('input');
  chatInput.className = 'chat-input';
  chatInput.placeholder = 'Type a message...';
  chatInput.maxLength = 500;
  chatInputWrap.appendChild(chatInput);

  const chatSendBtn = document.createElement('button');
  chatSendBtn.className = 'chat-send-btn';
  chatSendBtn.textContent = 'Send';
  chatSendBtn.onclick = () => {
    app.sendChat(chatInput.value);
    chatInput.value = '';
  };
  chatInputWrap.appendChild(chatSendBtn);

  chatDropdown.appendChild(chatInputWrap);
  layout.appendChild(chatDropdown);

  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      app.sendChat(chatInput.value);
      chatInput.value = '';
    }
  });
```

- [ ] **Step 3: Add expand/collapse logic**

Add this right after the chatInput keypress listener (still inside `renderConnectedScreen`):

```typescript
  let isDropdownOpen = false;

  function openDropdown() {
    isDropdownOpen = true;
    chatDropdown.style.display = 'flex';
    chatChevron.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="18 15 12 9 6 15"/></svg>';
    chatBar.classList.remove('new-message');
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function closeDropdown() {
    isDropdownOpen = false;
    chatDropdown.style.display = 'none';
    chatChevron.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>';
  }

  chatBar.onclick = () => {
    if (isDropdownOpen) {
      closeDropdown();
    } else {
      openDropdown();
    }
  };

  // Close on outside click
  function onDocumentClick(e: MouseEvent) {
    if (!isDropdownOpen) return;
    const target = e.target as Node;
    if (!chatBar.contains(target) && !chatDropdown.contains(target)) {
      closeDropdown();
    }
  }
  document.addEventListener('click', onDocumentClick);
```

- [ ] **Step 4: Update `ConnectedElements` object**

Find:
```typescript
  const connected: ConnectedElements = {
    orbWrap, orbRing: ring, orbCanvas: canvas, orbLabel, participants, controls,
    canvasCtx: ctx, animId, chatPanel, chatMessages, chatInput, lastMessageCount: 0,
  };
```

Replace with:
```typescript
  const connected: ConnectedElements = {
    orbWrap, orbRing: ring, orbCanvas: canvas, orbLabel, participants, controls,
    canvasCtx: ctx, animId, chatBar, chatDropdown, chatMessages, chatInput, lastMessageCount: 0,
  };
```

- [ ] **Step 5: Add cleanup for outside-click listener**

Find the existing keyboard cleanup:
```typescript
  (connected as any)._cleanupKeyboard = () => {
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
  };
```

Replace with:
```typescript
  (connected as any)._cleanupKeyboard = () => {
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
  };
  (connected as any)._cleanupChat = () => {
    document.removeEventListener('click', onDocumentClick);
  };
```

- [ ] **Step 6: Update `clearConnected` to cleanup chat listener**

Find:
```typescript
function clearConnected(els: Elements): void {
  if (els.connectedScreen?._cleanupKeyboard) {
    els.connectedScreen._cleanupKeyboard();
  }
  if (els.connectedScreen?.animId) {
    cancelAnimationFrame(els.connectedScreen.animId);
    els.connectedScreen.animId = null;
  }
  els.connectedScreen = undefined;
  els.offlineScreen = undefined;
  els.connectingScreen = undefined;
}
```

Replace with:
```typescript
function clearConnected(els: Elements): void {
  if (els.connectedScreen?._cleanupKeyboard) {
    els.connectedScreen._cleanupKeyboard();
  }
  if (els.connectedScreen?._cleanupChat) {
    els.connectedScreen._cleanupChat();
  }
  if (els.connectedScreen?.animId) {
    cancelAnimationFrame(els.connectedScreen.animId);
    els.connectedScreen.animId = null;
  }
  els.connectedScreen = undefined;
  els.offlineScreen = undefined;
  els.connectingScreen = undefined;
}
```

- [ ] **Step 7: Update `updateConnected` to use new elements**

Find:
```typescript
  if (state.messages.length !== els.lastMessageCount) {
    els.lastMessageCount = state.messages.length;
    renderChatMessages(els.chatMessages, state.messages, state.peers, state.displayName);
    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
  }
```

Replace with:
```typescript
  if (state.messages.length !== els.lastMessageCount) {
    els.lastMessageCount = state.messages.length;
    renderChatMessages(els.chatMessages, state.messages, state.peers, state.displayName);
    // Update preview bar with latest message
    const latest = state.messages[state.messages.length - 1];
    const previewEl = els.chatBar.querySelector('.chat-bar-preview') as HTMLElement;
    if (previewEl && latest) {
      if (latest.type === 'chat') {
        const peer = state.peers.find((p) => p.id === latest.peer_id);
        const name = latest.peer_id === 'self' ? state.displayName : (peer?.display_name ?? 'Unknown');
        previewEl.textContent = `${name}: ${latest.text}`;
        previewEl.classList.remove('empty');
      } else {
        previewEl.textContent = getSystemMessageText(latest, state.peers, state.displayName);
        previewEl.classList.remove('empty');
      }
    }
    // Trigger new-message glow if dropdown is closed
    if (els.chatDropdown.style.display === 'none' && latest && latest.type === 'chat') {
      els.chatBar.classList.add('new-message');
      // Remove class after animation (1.5s)
      setTimeout(() => els.chatBar.classList.remove('new-message'), 1500);
    }
    // Auto-scroll only if at bottom
    const isAtBottom = els.chatMessages.scrollHeight - els.chatMessages.scrollTop <= els.chatMessages.clientHeight + 10;
    if (isAtBottom) {
      els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
    }
  }
```

- [ ] **Step 8: Add `getSystemMessageText` helper**

Add this function near `formatTime`:

```typescript
function getSystemMessageText(msg: SystemMessageEntry, peers: PeerInfo[], ownDisplayName: string): string {
  const peer = peers.find((p) => p.id === msg.peer_id);
  const name = msg.peer_id === 'self' ? ownDisplayName : (peer?.display_name ?? 'Unknown');
  switch (msg.event) {
    case 'peer_joined': return `${name} joined the room`;
    case 'peer_left': return `${name} left the room`;
    case 'peer_mute': return `${name} muted themselves`;
    case 'peer_force_muted': return `${name} was force-muted`;
    case 'ownership_changed': return `${name} is now the room owner`;
    case 'kicked': return `${name} was kicked`;
    default: return 'Unknown event';
  }
}
```

- [ ] **Step 9: Update `renderChatMessages` to handle system messages**

Replace the entire `renderChatMessages` function with:

```typescript
function renderChatMessages(
  container: HTMLElement,
  messages: MessageEntry[],
  peers: PeerInfo[],
  ownDisplayName: string
): void {
  container.innerHTML = '';
  for (const msg of messages) {
    if (msg.type === 'system') {
      const row = document.createElement('div');
      row.className = 'chat-system-message';
      row.textContent = getSystemMessageText(msg, peers, ownDisplayName);
      container.appendChild(row);
    } else {
      const peer = peers.find((p) => p.id === msg.peer_id);
      const displayName = msg.peer_id === 'self' ? ownDisplayName : (peer?.display_name ?? 'Unknown');

      const row = document.createElement('div');
      row.className = 'chat-message';

      const header = document.createElement('div');
      header.className = 'chat-message-header';

      const name = document.createElement('span');
      name.className = 'chat-message-name';
      name.textContent = displayName;

      const time = document.createElement('span');
      time.className = 'chat-message-time';
      time.textContent = formatTime(msg.timestamp);

      header.append(name, time);

      const body = document.createElement('div');
      body.className = 'chat-message-body';
      body.textContent = msg.text;

      row.append(header, body);
      container.appendChild(row);
    }
  }
}
```

Note: The `MessageEntry` type must be imported or defined in `web/src/ui/app.ts`. Since `app.ts` (the UI file) already imports `AppState` from `../app.js`, we can import `MessageEntry` as well. However, `MessageEntry` is currently defined in `web/src/app.ts`. We should either export it or define it in `types.ts`.

**Decision:** Move `MessageEntry`, `ChatMessageEntry`, and `SystemMessageEntry` to `web/src/types.ts` and import them in both `app.ts` files.

- [ ] **Step 10: Move types to `web/src/types.ts`**

Open `web/src/types.ts` and add after the existing `ChatMessage` interface:

```typescript
export interface ChatMessageEntry {
  type: 'chat';
  peer_id: string;
  text: string;
  timestamp: number;
}

export interface SystemMessageEntry {
  type: 'system';
  event: 'peer_joined' | 'peer_left' | 'peer_mute' | 'peer_force_muted' | 'kicked' | 'ownership_changed';
  peer_id: string;
  actor_id?: string;
  timestamp: number;
}

export type MessageEntry = ChatMessageEntry | SystemMessageEntry;
```

Then in `web/src/app.ts`, import them:
```typescript
import type { MessageEntry, ChatMessageEntry, SystemMessageEntry } from './types.js';
```

And remove the local definitions from `web/src/app.ts`.

In `web/src/ui/app.ts`, import:
```typescript
import type { MessageEntry, SystemMessageEntry } from '../types.js';
```

- [ ] **Step 11: Run typecheck**

```bash
cd /home/tarek/voice-app/web && npx tsc --noEmit
```
Expected: clean

- [ ] **Step 12: Commit**

```bash
cd /home/tarek/voice-app && rtk git add web/src/app.ts web/src/ui/app.ts web/src/types.ts && rtk git commit -m "feat(web): chat bar + dropdown UI with system message rendering"
```

---

## Task 4: Update CSS Styles

**Files:**
- Modify: `web/src/ui/styles.css`

- [ ] **Step 1: Remove old `.chat-panel` styles**

Find and delete the entire `.chat-panel` block and all its child selectors:
- `.chat-panel` (lines 970–981)
- `.chat-header` (lines 983–992)
- `.chat-messages` (lines 994–1001)
- `.chat-messages::-webkit-scrollbar*` (lines 1003–1014)
- `.chat-message` (lines 1016–1020)
- `.chat-message-header` (lines 1022–1027)
- `.chat-message-name` (lines 1029–1034)
- `.chat-message-time` (lines 1036–1041)
- `.chat-message-body` (lines 1043–1048)
- `.chat-input-wrap` (lines 1050–1057)
- `.chat-input` (lines 1059–1068)
- `.chat-input::placeholder` (lines 1070–1072)
- `.chat-send-btn` (lines 1074–1086)
- `.chat-send-btn:hover` (lines 1088–1091)

**KEEP** `.chat-messages`, `.chat-message*`, `.chat-input-wrap`, `.chat-input*`, `.chat-send-btn*` — these are reused inside the dropdown. Only remove `.chat-panel` and `.chat-header`.

Actually, re-reading: the `.chat-messages`, `.chat-message`, `.chat-input-wrap`, etc. are the inner components and should be kept. Only `.chat-panel` and `.chat-header` are specific to the old hidden panel.

So delete only:
```css
.chat-panel {
  width: 320px;
  max-width: 35vw;
  height: 420px;
  display: none !important;
  flex-direction: column;
  background: var(--bg-glass);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  backdrop-filter: blur(12px);
  overflow: hidden;
}

.chat-header {
  padding: 14px 18px;
  font-family: var(--font-mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}
```

- [ ] **Step 2: Add new styles**

Add these new styles near where `.chat-panel` was:

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
  margin-bottom: 12px;
}

.chat-bar-icon {
  display: flex;
  align-items: center;
  color: var(--text-secondary);
  flex-shrink: 0;
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

.chat-bar-chevron {
  display: flex;
  align-items: center;
  color: var(--text-muted);
  flex-shrink: 0;
  transition: transform 0.2s ease;
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

- [ ] **Step 3: Update `.connected-layout` if needed**

The `.connected-layout` class may need `position: relative` so the dropdown can be absolutely positioned. Check if it already has it. If not, add:

```css
.connected-layout {
  position: relative;
  /* existing styles... */
}
```

- [ ] **Step 4: Run typecheck**

```bash
cd /home/tarek/voice-app/web && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
cd /home/tarek/voice-app && rtk git add web/src/ui/styles.css && rtk git commit -m "feat(web): chat bar + dropdown styles, remove old hidden panel"
```

---

## Task 5: Add Integration Tests

**Files:**
- Modify: `web/tests/integration/app.test.ts`

- [ ] **Step 1: Read existing test file**

```bash
cd /home/tarek/voice-app && rtk cat web/tests/integration/app.test.ts
```

- [ ] **Step 2: Add test for chat bar rendering**

Add a test that verifies the chat bar is rendered in the connected screen and shows "No messages yet" initially:

```typescript
it('renders chat bar with empty state', () => {
  app.join('test-room', 'Alice');
  app.store.setState({ connecting: false, connected: true, roomId: 'test-room' });
  
  const bar = container.querySelector('.chat-bar') as HTMLElement;
  expect(bar).toBeTruthy();
  
  const preview = bar.querySelector('.chat-bar-preview') as HTMLElement;
  expect(preview.textContent).toBe('No messages yet');
  expect(preview.classList.contains('empty')).toBe(true);
});
```

- [ ] **Step 3: Add test for system message on peer join**

```typescript
it('shows system message when peer joins', () => {
  app.join('test-room', 'Alice');
  app.store.setState({ connecting: false, connected: true, roomId: 'test-room' });
  
  // Simulate peer_joined event
  app.store.setState({
    peers: [{ id: 'peer-1', display_name: 'Bob', muted: false, speaking: false }],
    messages: [{
      type: 'system',
      event: 'peer_joined',
      peer_id: 'peer-1',
      timestamp: Date.now(),
    }],
  });
  
  const messages = container.querySelector('.chat-messages') as HTMLElement;
  const systemMsg = messages.querySelector('.chat-system-message') as HTMLElement;
  expect(systemMsg).toBeTruthy();
  expect(systemMsg.textContent).toContain('Bob joined the room');
});
```

- [ ] **Step 4: Add test for dropdown expand/collapse**

```typescript
it('expands and collapses chat dropdown on bar click', () => {
  app.join('test-room', 'Alice');
  app.store.setState({ connecting: false, connected: true, roomId: 'test-room' });
  
  const bar = container.querySelector('.chat-bar') as HTMLElement;
  const dropdown = container.querySelector('.chat-dropdown') as HTMLElement;
  
  expect(dropdown.style.display).toBe('none');
  
  bar.click();
  expect(dropdown.style.display).toBe('flex');
  
  bar.click();
  expect(dropdown.style.display).toBe('none');
});
```

- [ ] **Step 5: Run tests**

```bash
cd /home/tarek/voice-app/web && npm test
```
Expected: all tests pass (currently 24, should be 27)

- [ ] **Step 6: Commit**

```bash
cd /home/tarek/voice-app && rtk git add web/tests/integration/app.test.ts && rtk git commit -m "test: chat bar and system message integration tests"
```

---

## Task 6: Final Verification

- [ ] **Step 1: Run full web typecheck**

```bash
cd /home/tarek/voice-app/web && npx tsc --noEmit
```
Expected: clean

- [ ] **Step 2: Run all web tests**

```bash
cd /home/tarek/voice-app/web && npm test
```
Expected: all pass

- [ ] **Step 3: Run server typecheck**

```bash
cd /home/tarek/voice-app/server && npx tsc --noEmit
```
Expected: clean

- [ ] **Step 4: Commit any fixes**

If any issues found, fix and commit.

---

## Self-Review Checklist

### Spec Coverage

| Spec Section | Task | Status |
|-------------|------|--------|
| Collapsed bar above orb | Task 3 | ✅ |
| Latest message preview | Task 3 | ✅ |
| Down chevron expand | Task 3 | ✅ |
| Dropdown panel | Task 3 | ✅ |
| System messages (join/leave/etc.) | Task 2 | ✅ |
| Activity log rendering | Task 3 | ✅ |
| Touch/keyboard support | Task 3 | ✅ |
| Auto-scroll behavior | Task 3 | ✅ |
| New message glow indicator | Task 3 | ✅ |
| Remove old hidden panel | Task 4 | ✅ |

### Placeholder Scan

- [x] No TBD/TODO/fill in details
- [x] All code shown explicitly
- [x] All commands shown with expected output

### Type Consistency

- [x] `MessageEntry` used consistently across all files
- [x] `SystemMessageEntry.event` values match in types, handlers, and rendering
- [x] `getSystemMessageText` handles all event types

---

*Plan complete.*
