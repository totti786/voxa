# Push-to-Talk Orb Interaction Design

**Date:** 2026-04-26

## Goal
When PTT mode is enabled, the main orb becomes a press-and-hold control for transmitting audio. The orb highlights in green while the user is actively pushing to talk (via mouse/touch or keybind).

## Context

The Voxa web client already has partial PTT infrastructure:
- `pttEnabled` / `pttActive` state in `AppState`
- `setPttActive()` method in `VoiceApp` that pauses/resumes the producer
- Control keybind wired in `main.ts`
- PTT toggle in the radial control menu
- `syncOutgoingAudioState()` already respects PTT: `shouldSend = !muted && (!pttEnabled || pttActive)`

What's missing is the **orb press-and-hold interaction** and the **green visual highlight**.

## Current Orb Behavior

- Click = toggle mute/unmute
- Visual states: `.active` (amber, speaking), `.muted` (red, muted), idle (subtle border)
- The `updateConnected()` function updates classes based on `localSpeaking` and `localMuted`

## Design

### 1. Interaction Model

When `pttEnabled === true`:
- **Orb click behavior changes** from toggle-mute to press-and-hold
- `pointerdown` on orb → `app.setPttActive(true)`
- `pointerup` / `pointerleave` on orb → `app.setPttActive(false)`
- Keybind (Control) continues to work exactly as before
- Manual mute/unmute via radial menu or 'M' keybind still works independently

When `pttEnabled === false`:
- Orb reverts to toggle-mute behavior (unchanged)

### 2. Visual States

Add a new `.ptt-active` CSS class:
```css
.orb-ring.ptt-active {
  border-color: #2ecc71;
  box-shadow:
    0 0 50px rgba(46, 204, 113, 0.4),
    0 0 100px rgba(46, 204, 113, 0.06),
    inset 0 0 50px rgba(46, 204, 113, 0.04);
  background: radial-gradient(circle at 50% 50%, rgba(46, 204, 113, 0.06) 0%, transparent 60%);
}

.orb-ring.ptt-active ~ .orb-label {
  color: #2ecc71;
}
```

State priority in `updateConnected()`:
1. `localMuted` → `.muted` (red) — highest priority
2. `pttActive` → `.ptt-active` (green) — only when PTT is enabled
3. `localSpeaking` → `.active` (amber) — existing behavior
4. Idle → no modifier class

### 3. Label Text

Update `orbLabel.textContent` logic in `updateConnected()`:
- PTT enabled + muted → "Muted"
- PTT enabled + active → "Talking..."
- PTT enabled + idle → "Hold to talk"
- PTT disabled + muted → "Muted — Click to unmute"
- PTT disabled + unmuted → "Click to mute"

### 4. Files Changed

| File | Change |
|------|--------|
| `web/src/ui/app.ts` | Add pointer event listeners to orbWrap; update label logic in `updateConnected()`; add `.ptt-active` class to ring |
| `web/src/ui/styles.css` | Add `.orb-ring.ptt-active` and `.orb-ring.ptt-active ~ .orb-label` rules |

### 5. Edge Cases

- **PTT toggle while holding:** If user disables PTT via radial menu while holding orb, `pointerup` should still fire and release PTT (no-op since PTT is now off)
- **Mouse leaves window:** `pointerleave` on orb handles this
- **Touch devices:** `pointerdown`/`pointerup` work for touch automatically
- **Mute while PTT active:** If user mutes via 'M' key while holding orb, mute takes visual precedence (red over green)

## Testing

1. Enable PTT via radial menu
2. Press and hold orb → green glow appears, label says "Talking...", audio transmits
3. Release orb → green glow disappears, label returns to "Hold to talk", audio stops
4. Press Control key → same green glow behavior
5. Disable PTT → orb reverts to toggle-mute, click toggles mute/unmute
