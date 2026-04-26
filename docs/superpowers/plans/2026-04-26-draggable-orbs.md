# Draggable Orbs, Username Persistence, and Name Overlap Fix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist username across sessions, fix peer name overlap with the main orb label, and make peer orbs draggable along the ring circumference with persistent positions.

**Architecture:** Three independent UI/UX improvements to the join screen and participants ring. Username persistence uses localStorage. Name overlap fix restructures the tooltip. Draggable orbs use pointer events and angle-based positioning stored per-room in localStorage.

**Tech Stack:** Vanilla TypeScript, CSS, localStorage

---

## Files

- `web/src/ui/app.ts` — Join screen rendering, username pre-fill
- `web/src/app.ts` — VoiceApp class, join() method
- `web/src/ui/participants.ts` — Peer orb rendering, drag handlers, angle storage
- `web/src/ui/styles.css` — Orb and tooltip styles

---

### Task 1: Persist username to localStorage on join

**Files:**
- Modify: `web/src/app.ts`

- [ ] **Step 1: Add localStorage save in join()**

In `web/src/app.ts`, find the `join()` method. After setting `displayName` in store state, save it to localStorage:

```typescript
this.store.setState({ displayName: name });
localStorage.setItem('voxa-username', name);
```

- [ ] **Step 2: Commit**

```bash
git add web/src/app.ts
git commit -m "feat: persist username to localStorage"
```

---

### Task 2: Pre-fill username on join screen

**Files:**
- Modify: `web/src/ui/app.ts`

- [ ] **Step 1: Read localStorage and pre-fill name input**

In `renderOfflineScreen()` around line 252, after creating `nameInput`, add:

```typescript
const savedName = localStorage.getItem('voxa-username');
if (savedName) {
  nameInput.value = savedName;
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/ui/app.ts
git commit -m "feat: pre-fill username from localStorage on join screen"
```

---

### Task 3: Fix peer name overlap — move name into tooltip

**Files:**
- Modify: `web/src/ui/participants.ts`
- Modify: `web/src/ui/styles.css`

- [ ] **Step 1: Remove .peer-name from orb markup**

In `web/src/ui/participants.ts`, in the `orb.innerHTML` template, remove:
```html
<span class="peer-name">${escapeHtml(peer.display_name)}</span>
```

And add the name to the tooltip instead:
```html
<span class="volume-tooltip">
  <span class="tooltip-name">${escapeHtml(peer.display_name)}</span>
  <input type="range" class="peer-volume-slider" min="0" max="200" value="${Math.round((app.peerVolumes.get(peer.id) ?? 1) * 100)}">
</span>
```

- [ ] **Step 2: Remove .peer-name CSS and style tooltip name**

In `web/src/ui/styles.css`, remove the `.peer-name` rule (lines 261-274).

Add styles for `.tooltip-name` inside the tooltip:
```css
.volume-tooltip .tooltip-name {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  text-align: center;
  margin-bottom: 8px;
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/ui/participants.ts web/src/ui/styles.css
git commit -m "fix: move peer name into hover tooltip to prevent overlap"
```

---

### Task 4: Add draggable peer orbs with angle persistence

**Files:**
- Modify: `web/src/ui/participants.ts`
- Modify: `web/src/ui/styles.css`

- [ ] **Step 1: Add helper functions for angle storage**

At the top of `web/src/ui/participants.ts`, add:

```typescript
function getOrbAnglesKey(roomId: string): string {
  return `voxa-orb-pos:${roomId}`;
}

function loadOrbAngles(roomId: string): Map<string, number> {
  try {
    const raw = localStorage.getItem(getOrbAnglesKey(roomId));
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, number>;
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

function saveOrbAngles(roomId: string, angles: Map<string, number>): void {
  const obj = Object.fromEntries(angles);
  localStorage.setItem(getOrbAnglesKey(roomId), JSON.stringify(obj));
}
```

- [ ] **Step 2: Update renderParticipants signature and implement drag**

Change the function signature to include `roomId`:
```typescript
export function renderParticipants(
  container: HTMLElement,
  peers: PeerInfo[],
  app: VoiceApp,
  roomId: string
): void {
```

Inside the function, after `container.innerHTML = ''`, load stored angles:
```typescript
const storedAngles = loadOrbAngles(roomId);
const currentPeerIds = new Set(peers.map((p) => p.id));

// Clean up orphaned entries
for (const peerId of storedAngles.keys()) {
  if (!currentPeerIds.has(peerId)) {
    storedAngles.delete(peerId);
  }
}
```

For each peer, check for stored angle:
```typescript
peers.forEach((peer, index) => {
  let angle = storedAngles.get(peer.id);
  if (angle === undefined) {
    // Even spacing for unpositioned peers
    const unpositionedCount = peers.filter((p) => !storedAngles.has(p.id)).length;
    const unpositionedIndex = peers.filter((p, i) => i < index && !storedAngles.has(p.id)).length;
    angle = (unpositionedIndex / Math.max(unpositionedCount, 1)) * Math.PI * 2 - Math.PI / 2;
  }
  // ... rest of positioning logic uses `angle` instead of calculating from index
```

Add drag handlers to each orb:
```typescript
  let isDragging = false;

  orb.addEventListener('pointerdown', (e) => {
    isDragging = true;
    orb.setPointerCapture(e.pointerId);
    orb.classList.add('dragging');
  });

  orb.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const rect = container.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const newAngle = Math.atan2(dy, dx);

    const x = centerX + Math.cos(newAngle) * radius - 32;
    const y = centerY + Math.sin(newAngle) * radius - 32;
    orb.style.left = `${x}px`;
    orb.style.top = `${y}px`;

    // Update stored angle in real-time
    storedAngles.set(peer.id, newAngle);
  });

  orb.addEventListener('pointerup', () => {
    if (!isDragging) return;
    isDragging = false;
    orb.classList.remove('dragging');
    saveOrbAngles(roomId, storedAngles);
  });

  orb.addEventListener('pointerleave', () => {
    if (!isDragging) return;
    isDragging = false;
    orb.classList.remove('dragging');
    saveOrbAngles(roomId, storedAngles);
  });
```

- [ ] **Step 3: Update call sites to pass roomId**

In `web/src/ui/app.ts`, find the call to `renderParticipants()` and pass `state.roomId ?? ''`:
```typescript
renderParticipants(els.participants, state.peers, app, state.roomId ?? '');
```

- [ ] **Step 4: Add dragging CSS**

In `web/src/ui/styles.css`, add:
```css
.peer-orb.dragging {
  transform: scale(1.1);
  box-shadow: 0 0 30px rgba(255, 159, 67, 0.3);
  z-index: 10;
  cursor: grabbing;
}

.peer-orb {
  cursor: grab;
}
```

- [ ] **Step 5: Commit**

```bash
git add web/src/ui/participants.ts web/src/ui/app.ts web/src/ui/styles.css
git commit -m "feat: draggable peer orbs with persistent positions"
```

---

## Verification

- [ ] Username pre-fills after joining and reloading
- [ ] Peer names don't appear below orbs
- [ ] Peer names appear in hover tooltips
- [ ] Orbs can be dragged along the ring
- [ ] Orb positions persist after reload in same room
- [ ] New peers join without displacing dragged peers
- [ ] TypeScript compiles without errors
