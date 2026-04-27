# Keyboard Shortcuts & Device Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add global keyboard shortcuts (P for PTT, M for mute, D for deafen, Esc to clear focus) and replace the full-width audio device dropdown with a compact microphone button next to the username field.

**Architecture:** Global keyboard listeners attach when entering the connected screen and detach on screen change. The device selector becomes a button that opens a dropdown, placed inline with the username input. PTT auto-enables on first P key hold.

**Tech Stack:** Vanilla TypeScript, vitest for testing

---

## Files Changed

| File | Responsibility |
|------|---------------|
| `web/src/ui/app.ts` | Render device button + dropdown in join form, attach/detach keyboard listeners in connected screen |
| `web/src/ui/styles.css` | Styles for device selector button and dropdown |
| `web/src/app.ts` | Add `pKeyPttActive` flag to VoiceApp class to track P key state |
| `web/tests/integration/app.test.ts` | Tests for keyboard shortcuts |

---

### Task 1: Add P-key tracking state to VoiceApp

**Files:**
- Modify: `web/src/app.ts`

The `P` key needs to know whether it was the one that activated PTT, so that `keyup` only deactivates if `keydown` activated it. Add a private flag.

- [ ] **Step 1: Add `pKeyPttActive` field and getter**

In `web/src/app.ts`, find the `VoiceApp` class properties and add:

```typescript
private pKeyPttActive = false;
```

Find `setPttActive` and add a new method after it:

```typescript
  setPttActive(active: boolean): void {
    const state = this.store.getState();
    if (!active && state.pttEnabled && state.localSpeaking) {
      this.store.setState({ localSpeaking: false });
      this.signaling.setSpeaking(false);
    }
    this.store.setState({ pttActive: active });
    this.syncOutgoingAudioState();
  }

  setPttActiveFromKey(active: boolean): void {
    this.pKeyPttActive = active;
    const state = this.store.getState();
    if (active && !state.pttEnabled) {
      this.store.setState({ pttEnabled: true });
    }
    this.setPttActive(active);
  }

  isPKeyPttActive(): boolean {
    return this.pKeyPttActive;
  }
```

- [ ] **Step 2: Commit**

```bash
git add web/src/app.ts
git commit -m "feat: add P-key PTT tracking to VoiceApp"
```

---

### Task 2: Replace device select with compact button in join form

**Files:**
- Modify: `web/src/ui/app.ts`
- Modify: `web/src/ui/styles.css`

- [ ] **Step 1: Update `OfflineElements` interface**

In `web/src/ui/app.ts`, change:

```typescript
interface OfflineElements {
  errorEl: HTMLElement;
  deviceSelect: HTMLSelectElement;
  createForm: HTMLElement | null;
}
```

To:

```typescript
interface OfflineElements {
  errorEl: HTMLElement;
  deviceBtn: HTMLButtonElement;
  createForm: HTMLElement | null;
}
```

- [ ] **Step 2: Replace device `<select>` with button + dropdown**

In `renderOfflineScreen`, replace lines 233-250 (the `deviceSelect` creation block):

```typescript
  const deviceBtn = document.createElement('button');
  deviceBtn.className = 'device-select-btn';
  deviceBtn.type = 'button';
  deviceBtn.title = 'Select microphone';
  deviceBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';

  const deviceDropdown = document.createElement('div');
  deviceDropdown.className = 'device-dropdown';
  deviceDropdown.style.display = 'none';

  async function refreshDeviceDropdown() {
    deviceDropdown.innerHTML = '';
    const defaultOpt = document.createElement('div');
    defaultOpt.className = 'device-option';
    defaultOpt.textContent = 'Default Microphone';
    defaultOpt.onclick = () => {
      app.store.setState({ selectedDeviceId: null });
      localStorage.removeItem('voxa-preferred-device');
      deviceDropdown.style.display = 'none';
    };
    deviceDropdown.appendChild(defaultOpt);

    try {
      const devices = await app.enumerateAudioDevices();
      const inputs = devices.filter((d) => d.kind === 'audioinput');
      for (const device of inputs) {
        const opt = document.createElement('div');
        opt.className = 'device-option';
        opt.textContent = device.label || `Microphone ${deviceDropdown.children.length}`;
        opt.onclick = () => {
          app.store.setState({ selectedDeviceId: device.deviceId });
          localStorage.setItem('voxa-preferred-device', device.deviceId);
          deviceDropdown.style.display = 'none';
        };
        deviceDropdown.appendChild(opt);
      }
    } catch (err) {
      console.error('Failed to enumerate devices:', err);
    }
  }

  deviceBtn.onclick = () => {
    const isOpen = deviceDropdown.style.display === 'block';
    if (!isOpen) {
      refreshDeviceDropdown();
    }
    deviceDropdown.style.display = isOpen ? 'none' : 'block';
  };

  const savedDevice = localStorage.getItem('voxa-preferred-device');
  if (savedDevice) {
    app.store.setState({ selectedDeviceId: savedDevice });
  }

  // Build a name input row with device button inline
  const nameRow = document.createElement('div');
  nameRow.className = 'name-row';
  const nameInput = document.createElement('input');
  nameInput.placeholder = 'Your name';
  nameInput.className = 'name-input';
  const savedName = localStorage.getItem('voxa-username');
  if (savedName) {
    nameInput.value = savedName;
  }
  nameRow.appendChild(nameInput);
  nameRow.appendChild(deviceBtn);
  nameRow.appendChild(deviceDropdown);
  wrap.appendChild(nameRow);
```

Then remove the old `wrap.appendChild(nameInput)` line (it was ~258 in the original).

- [ ] **Step 3: Update `els.offlineElements` assignment**

Change:

```typescript
els.offlineElements = { errorEl, deviceSelect, createForm };
```

To:

```typescript
els.offlineElements = { errorEl, deviceBtn, createForm };
```

- [ ] **Step 4: Add CSS for device button and dropdown**

In `web/src/ui/styles.css`, add at the end:

```css
.name-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  position: relative;
}

.name-input {
  flex: 1;
  padding: 14px 0;
  border: none;
  border-bottom: 1px solid var(--border-subtle);
  background: transparent;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: 16px;
  transition: all 0.3s ease;
  outline: none;
}

.name-input::placeholder {
  color: var(--text-muted);
}

.name-input:focus {
  border-bottom-color: var(--accent-amber);
}

.device-select-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--border-subtle);
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.device-select-btn svg {
  width: 18px;
  height: 18px;
}

.device-select-btn:hover {
  border-color: var(--border-glow);
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.06);
}

.device-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 240px;
  max-height: 200px;
  overflow-y: auto;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 20;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.device-option {
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.device-option:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-primary);
}
```

Also remove the old `.device-select` CSS rules if they exist (they were at ~779-795 in the original CSS).

- [ ] **Step 5: Commit**

```bash
git add web/src/ui/app.ts web/src/ui/styles.css
git commit -m "feat(web): compact microphone device selector button in join form"
```

---

### Task 3: Add global keyboard shortcuts in connected screen

**Files:**
- Modify: `web/src/ui/app.ts`

- [ ] **Step 1: Add keyboard listeners in `renderConnectedScreen`**

In `web/src/ui/app.ts`, in `renderConnectedScreen`, after `els.connectedScreen = connected;` (around line 577), add:

```typescript
  function isInputFocused(): boolean {
    const el = document.activeElement;
    if (!el) return false;
    return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as HTMLElement).isContentEditable;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (isInputFocused()) return;
    const state = app.store.getState();
    switch (e.key.toLowerCase()) {
      case 'p': {
        if (!app.isPKeyPttActive()) {
          app.setPttActiveFromKey(true);
        }
        break;
      }
      case 'm': {
        app.setMute(!state.localMuted);
        break;
      }
      case 'd': {
        app.setDeafen(!state.deafened);
        break;
      }
      case 'escape': {
        const focused = document.activeElement as HTMLElement | null;
        if (focused && focused.blur) focused.blur();
        break;
      }
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (e.key.toLowerCase() === 'p' && app.isPKeyPttActive()) {
      app.setPttActiveFromKey(false);
    }
  }

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  // Store cleanup function on connected elements for teardown
  (connected as any)._cleanupKeyboard = () => {
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
  };
```

- [ ] **Step 2: Clean up listeners on screen change**

In `clearConnected` function (around line 181), add before canceling animation frame:

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

- [ ] **Step 3: Commit**

```bash
git add web/src/ui/app.ts
git commit -m "feat(web): global keyboard shortcuts — P for PTT, M for mute, D for deafen, Esc to clear focus"
```

---

### Task 4: Add integration tests for keyboard shortcuts

**Files:**
- Modify: `web/tests/integration/app.test.ts`

- [ ] **Step 1: Add PTT keyboard test**

Append to `web/tests/integration/app.test.ts`:

```typescript
  it('activates PTT on P key hold and auto-enables PTT mode', () => {
    const app = new VoiceApp('ws://test/ws');
    const producer = {
      paused: false,
      pause: vi.fn(function (this: any) { this.paused = true; }),
      resume: vi.fn(function (this: any) { this.paused = false; }),
    };
    app.producer = producer as any;

    expect(app.store.getState().pttEnabled).toBe(false);

    // Simulate P key down
    app.setPttActiveFromKey(true);
    expect(app.store.getState().pttEnabled).toBe(true);
    expect(app.store.getState().pttActive).toBe(true);
    expect(producer.resume).toHaveBeenCalled();

    // Simulate P key up
    app.setPttActiveFromKey(false);
    expect(app.store.getState().pttActive).toBe(false);
    expect(producer.pause).toHaveBeenCalled();
    // PTT mode should stay enabled
    expect(app.store.getState().pttEnabled).toBe(true);
  });

  it('toggles mute on M key', () => {
    const app = new VoiceApp('ws://test/ws');
    const producer = {
      paused: false,
      pause: vi.fn(function (this: any) { this.paused = true; }),
      resume: vi.fn(function (this: any) { this.paused = false; }),
    };
    app.producer = producer as any;

    app.setMute(true);
    expect(app.store.getState().localMuted).toBe(true);

    app.setMute(false);
    expect(app.store.getState().localMuted).toBe(false);
  });

  it('toggles deafen on D key', () => {
    const app = new VoiceApp('ws://test/ws');
    app.setDeafen(true);
    expect(app.store.getState().deafened).toBe(true);

    app.setDeafen(false);
    expect(app.store.getState().deafened).toBe(false);
  });
```

- [ ] **Step 2: Run tests**

```bash
cd web && npm test
```

Expected: All tests pass (21+ tests).

- [ ] **Step 3: Commit**

```bash
git add web/tests/integration/app.test.ts
git commit -m "test: keyboard shortcut integration tests"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run typecheck**

```bash
cd web && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Run all tests**

```bash
cd web && npm test
```

Expected: All tests pass.

- [ ] **Step 3: Commit any fixes**

If typecheck or tests failed, fix and commit:

```bash
git add -A
git commit -m "fix: typecheck and test fixes for keyboard shortcuts"
```

---

## Spec Coverage Check

| Spec Requirement | Task |
|-----------------|------|
| `P` key hold → auto-enable PTT mode + activate | Task 1 + Task 3 |
| `P` key release → deactivate, stay in PTT mode | Task 1 + Task 3 |
| `M` key → toggle mute | Task 3 |
| `D` key → toggle deafen | Task 3 |
| `Esc` → clear focus | Task 3 |
| Input guard (ignore shortcuts in inputs) | Task 3 |
| Compact device button next to username | Task 2 |
| Device dropdown with options | Task 2 |
| Save device preference | Task 2 |

**No gaps found.**

## Placeholder Scan

- No "TBD", "TODO", "implement later" found.
- All code blocks contain complete implementations.
- All test code is explicit with assertions.

## Type Consistency Check

- `setPttActiveFromKey` and `isPKeyPttActive` match usage in Task 3.
- `OfflineElements` interface updated consistently.
- Event handler signatures match DOM types.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-27-keyboard-shortcuts-and-device-selector.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
