# Username Persistence, Peer Name Overlap Fix, and Draggable Orbs

> **Date:** 2026-04-26
> **Status:** Design approved

## Summary

Three UX improvements for the Voxa voice app:

1. **Remember username** — Persist the user's display name to `localStorage` and pre-fill it on the join screen.
2. **Fix peer name overlap** — Move peer names from below the orb into the hover tooltip, eliminating overlap with the main orb label.
3. **Draggable peer orbs** — Allow users to drag peer orbs around the circle circumference and persist their positions per-room in `localStorage`.

---

## 1. Username Persistence

### Behavior

- On successful join (`app.join()`), save `displayName` to `localStorage` under key `voxa-username`.
- On join screen initialization, read `voxa-username` from `localStorage` and pre-fill the name input if present.
- The stored username is **not** cleared on disconnect/reconnect — it persists across sessions.
- On explicit room leave (not disconnect), optionally clear it. For now, keep it persistent indefinitely.

### Files

- `web/src/ui/app.ts` — `renderOfflineScreen()`: pre-fill `nameInput.value` from localStorage.
- `web/src/app.ts` — `join()`: save `displayName` to localStorage after successful join.

---

## 2. Peer Name Overlap Fix

### Problem

Peer names are rendered below each orb using `.peer-name` with `top: calc(100% + 8px)`. When multiple peers cluster at the bottom of the ring, these names overlap with each other and with the main orb label (`orb-label` at `bottom: -40px`).

### Solution

- Remove `.peer-name` from the static orb markup in `renderParticipants()`.
- Instead, show the peer's full display name inside the existing hover tooltip (`.volume-tooltip`), above the volume slider.
- Keep peer initials visible on the orb itself.

### Files

- `web/src/ui/participants.ts` — `renderParticipants()`: remove `.peer-name` from orb HTML; add name to tooltip.
- `web/src/ui/styles.css` — Remove `.peer-name` styles; adjust `.volume-tooltip` to include the name.

---

## 3. Draggable Peer Orbs

### Behavior

- Peer orbs already have `pointer-events: auto`.
- Add `pointerdown` / `pointermove` / `pointerup` handlers to each orb.
- On `pointerdown`, capture the pointer and mark the orb as dragging.
- On `pointermove`, calculate the angle from the ring center to the pointer using `atan2(dy, dx)`. Update the orb's position to follow the ring circumference at that angle.
- On `pointerup`, release the pointer and persist the final angle to `localStorage` under key `voxa-orb-pos:<roomId>` as a JSON object `{ [peerId]: angle }`.
- On render (`renderParticipants()`), check for stored angles first. If a peer has a stored angle, use it. Otherwise, fall back to even spacing.
- When a new peer joins, they are placed in the next available slot (even spacing among unpositioned peers).
- When a peer leaves, their stored angle is removed from localStorage.

### Edge Cases

- **Mobile touch**: `pointer` events work on both mouse and touch.
- **Ring resize**: The ring center and radius are calculated dynamically from the container. Dragged angles are absolute, so they adapt to resize.
- **No stored data**: First-time users see evenly spaced peers.
- **Orphaned data**: If localStorage contains angles for peers no longer in the room, they are ignored and cleaned up on the next render.

### Files

- `web/src/ui/participants.ts` — Add drag handlers and angle storage logic.
- `web/src/ui/styles.css` — Add `.peer-orb.dragging` style (slight scale-up or shadow to indicate active drag).

---

## Data Flow

```
User joins room
  → app.join() saves displayName to localStorage
  → renderParticipants() checks localStorage for stored angles
  → peers rendered at stored angles or evenly spaced

User drags orb
  → pointermove updates orb position along circumference
  → pointerup saves angle to localStorage

New peer joins
  → renderParticipants() places them in next available slot

Peer leaves
  → renderParticipants() removes their angle from localStorage
```

---

## Testing Notes

- Verify username pre-fill on page reload after joining a room.
- Verify peer names no longer appear below orbs.
- Verify peer name appears in hover tooltip.
- Verify dragging an orb moves it along the ring.
- Verify orb position persists after page reload in the same room.
- Verify new peers join at correct positions without displacing dragged peers.
