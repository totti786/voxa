# Keyboard Shortcuts & Audio Input Device Selection

**Date:** 2026-04-27
**Topic:** Global keyboard shortcuts + compact audio input selector
**Status:** Approved

---

## 1. Goals

1. Add global keyboard shortcuts for common voice actions
2. Replace the full-width audio device dropdown with a compact button next to the username field
3. Keep shortcuts from interfering with text input fields

---

## 2. Keyboard Shortcuts

All shortcuts are active only when the user is in a connected room (`state.connected === true`).

### Input Guard
Shortcuts are suppressed when `event.target` is an `<input>`, `<textarea>`, or `<select>` element, or when any element has `contenteditable="true"`. This prevents triggering actions while typing in chat, room name, username, etc.

### Shortcut Table

| Key | Behavior |
|-----|----------|
| `P` (hold) | **Push-to-Talk:** On `keydown`, if not already in PTT mode, enable PTT mode and activate transmission (`pttActive = true`). On `keyup`, deactivate transmission (`pttActive = false`). If PTT mode was already enabled before the keydown, only toggle `pttActive` without changing the mode. |
| `M` | **Toggle mute:** Calls `app.setMute(!state.localMuted)`. Guarded against force-mute (same behavior as the mic button). |
| `D` | **Toggle deafen:** Calls `app.setDeafen(!state.deafened)`. |
| `Esc` | **Clear focus:** Calls `document.activeElement?.blur()`. Closes any open dropdowns (device selector). Does not leave the room. |

### P Key Detailed Behavior

The `P` key should feel like a traditional push-to-talk keybind:

```
On keydown:
  - If currently focused in an input: ignore
  - If not in PTT mode: enable PTT mode, set pttActive = true
  - If already in PTT mode: set pttActive = true

On keyup:
  - If we activated PTT on the matching keydown: set pttActive = false
  - Do NOT disable PTT mode on keyup (user stays in PTT mode)
```

This means:
- First time you hold P: enters PTT mode + starts transmitting
- Release P: stops transmitting but stays in PTT mode
- Second hold P: just starts transmitting again
- To exit PTT mode: click the PTT button in the UI or press the PTT button again

**Rationale:** Users expect PTT to be a mode you enter, not something you have to enable before holding the key. Auto-enabling PTT on first hold removes friction.

---

## 3. Audio Input Device Selector

### Current State
A full-width `<select class="device-select">` dropdown is placed between the room selection and the username field, taking up vertical space.

### New Design

Replace the full-width dropdown with a **compact microphone icon button** placed inline to the **right of the username input field**.

**Layout:**
```
[ Your name                    ][🎤]
```

Where `[🎤]` is the device selector button.

### Behavior

1. **Default state:** Shows a microphone icon (same style as the control arc buttons, ~28px)
2. **Click:** Opens a compact dropdown below the button listing:
   - "Default Microphone"
   - All available `audioinput` devices by label
3. **Selection:** Clicking a device updates `app.store.setState({ selectedDeviceId })`, saves to `localStorage`, and closes the dropdown
4. **Tooltip:** Hovering shows the currently selected device name
5. **Keyboard access:** When dropdown is open, `Esc` closes it without selecting

### Styling

- Button: circular, 28px, subtle border, same color scheme as control buttons
- Dropdown: same dark theme as the app, rounded corners, subtle shadow
- Selected item: highlighted with accent color

---

## 4. Files to Modify

| File | Changes |
|------|---------|
| `web/src/ui/app.ts` | Add global keydown/keyup listeners in `renderConnectedScreen`, remove old device `<select>` from `renderOfflineScreen`, add compact device button next to username |
| `web/src/ui/styles.css` | Add styles for device selector button and dropdown |
| `web/src/app.ts` | Track whether P key was the one that enabled PTT (to handle keyup correctly) |

---

## 5. Testing

- [ ] Press `P` while not in PTT mode → enters PTT mode and starts transmitting
- [ ] Release `P` → stops transmitting, stays in PTT mode
- [ ] Press `M` → toggles mute
- [ ] Press `D` → toggles deafen
- [ ] Press `P` while typing in chat → nothing happens
- [ ] Press `Esc` while device dropdown is open → dropdown closes
- [ ] Click device button → dropdown shows available devices
- [ ] Select device → updates audio input, saves preference

---

*Spec approved by user.*
