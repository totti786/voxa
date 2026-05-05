import { VoiceApp } from '../app.js';
import type { AppState } from '../app.js';
import type { PeerInfo, ChatMessage, MessageEntry, SystemMessageEntry } from '../types.js';
import { startParticles } from './particles.js';
import { renderConnectedScreen, updateConnected } from './connectedScreen.js';
import type { ConnectedElements } from './connectedScreen.js';
import { escapeHtml } from './chat.js';

type Screen = 'offline' | 'connecting' | 'connected';

interface OfflineElements {
  errorEl: HTMLElement;
  deviceBtn: HTMLButtonElement;
  createForm: HTMLElement | null;
}

interface Elements {
  headerRoomInfo: HTMLElement;
  main: HTMLElement;
  stopParticles: (() => void) | null;
  reconnectingOverlay: HTMLElement;
  offlineScreen?: HTMLElement;
  offlineElements?: OfflineElements;
  connectingScreen?: HTMLElement;
  connectedScreen?: ConnectedElements;
}

export function renderApp(container: HTMLElement, app: VoiceApp): void {
  container.innerHTML = '';

  const particleCanvas = document.createElement('canvas');
  particleCanvas.className = 'particle-canvas';
  particleCanvas.width = window.innerWidth;
  particleCanvas.height = window.innerHeight;
  container.appendChild(particleCanvas);

  const ambient = document.createElement('div');
  ambient.className = 'ambient-glow';
  container.appendChild(ambient);

  const header = document.createElement('div');
  header.className = 'header';
  header.innerHTML = `<h1>Voxa</h1>`;
  const headerRoomInfo = document.createElement('div');
  headerRoomInfo.className = 'room-info';
  headerRoomInfo.textContent = 'OFFLINE';
  header.appendChild(headerRoomInfo);
  container.appendChild(header);

  const main = document.createElement('div');
  main.className = 'main';
  container.appendChild(main);

  const reconnectingOverlay = document.createElement('div');
  reconnectingOverlay.className = 'reconnecting-overlay';
  reconnectingOverlay.innerHTML =
    '<div class="reconnecting-spinner"></div><p>Reconnecting...</p>';
  reconnectingOverlay.style.display = 'none';
  container.appendChild(reconnectingOverlay);

  const stopParticles = (() => {
    const particleCtx = particleCanvas.getContext('2d');
    if (particleCtx) {
      return startParticles(particleCanvas, particleCtx);
    }
    return () => {};
  })();

  const els: Elements = {
    headerRoomInfo,
    main,
    stopParticles,
    reconnectingOverlay,
  };

  function handleResize() {
    particleCanvas.width = window.innerWidth;
    particleCanvas.height = window.innerHeight;
  }
  window.addEventListener('resize', handleResize);

  let currentScreen: Screen | null = null;

  function update(state: AppState) {
    let screen: Screen;
    if (state.connecting) screen = 'connecting';
    else if (state.connected) screen = 'connected';
    else screen = 'offline';

    els.headerRoomInfo.textContent = state.roomId ? state.roomId : 'OFFLINE';
    els.reconnectingOverlay.style.display = state.reconnecting ? 'flex' : 'none';
    container.classList.toggle('connected-page', screen === 'connected');

    if (screen !== currentScreen) {
      currentScreen = screen;
      clearConnected(els);
      main.innerHTML = '';

      if (screen === 'offline') {
        renderOfflineScreen(main, els, app);
      } else if (screen === 'connecting') {
        renderConnectingScreen(main, els);
      } else {
        els.connectedScreen = renderConnectedScreen(main, app);
      }
    }

    if (screen === 'connected' && els.connectedScreen) {
      updateConnected(els.connectedScreen, state, app);
    } else if (screen === 'offline' && els.offlineScreen) {
      updateOfflineScreen(els.offlineScreen, state);
    }

    if (screen === 'offline' && els.offlineElements) {
      updateOfflineElements(els.offlineElements, state);
    }
  }

  app.store.subscribe(update);
  update(app.store.getState());
}

function clearConnected(els: Elements): void {
  const participantCloser = (els.connectedScreen?.participants as any)
    ?.__tooltipCloser as EventListener | undefined;
  if (participantCloser) {
    document.removeEventListener('pointerdown', participantCloser);
  }
  const participantResizer = (els.connectedScreen?.participants as any)
    ?.__rectResizer as EventListener | undefined;
  if (participantResizer) {
    window.removeEventListener('resize', participantResizer);
  }
  if (els.connectedScreen?._cleanupKeyboard) {
    els.connectedScreen._cleanupKeyboard();
  }
  if (els.connectedScreen?._cleanupChat) {
    els.connectedScreen._cleanupChat();
  }
  if (els.connectedScreen?._cleanupResize) {
    els.connectedScreen._cleanupResize();
  }
  if (els.connectedScreen?.animId) {
    cancelAnimationFrame(els.connectedScreen.animId);
    els.connectedScreen.animId = null;
  }
  els.connectedScreen = undefined;
  els.offlineScreen = undefined;
  els.connectingScreen = undefined;
}

/**
 * ─── OFFLINE SCREEN ───
 */

function renderOfflineScreen(
  container: HTMLElement,
  els: Elements,
  app: VoiceApp
): void {
  const wrap = document.createElement('div');
  wrap.className = 'join-form';
  wrap.innerHTML = `
    <div class="hero-title">VOXA</div>
    <div class="hero-subtitle">Join the conversation</div>
  `;

  const errorEl = document.createElement('div');
  errorEl.className = 'join-error';
  errorEl.style.display = 'none';
  wrap.appendChild(errorEl);

  const roomGrid = document.createElement('div');
  roomGrid.className = 'room-grid';
  wrap.appendChild(roomGrid);

  const createCard = document.createElement('div');
  createCard.className = 'room-card create-room';
  createCard.innerHTML = `
    <div class="room-card-name">+ New Room</div>
    <div class="room-card-meta">Start a fresh conversation</div>
  `;
  roomGrid.appendChild(createCard);

  const createForm = document.createElement('div');
  createForm.className = 'create-room-form';
  createForm.style.display = 'none';
  createForm.innerHTML = `
    <input type="text" class="create-room-name" placeholder="Room name">
    <input type="password" class="create-room-password" placeholder="Password (optional)">
    <input type="number" class="create-room-max" placeholder="Max users" value="10" min="2" max="100">
    <button class="create-room-submit">Create Room</button>
  `;
  wrap.appendChild(createForm);

  const newRoomInput = document.createElement('input');
  newRoomInput.className = 'new-room-input';
  newRoomInput.placeholder = 'Room name';
  newRoomInput.style.display = 'none';
  wrap.appendChild(newRoomInput);

  // Device button
  const deviceBtn = document.createElement('button');
  deviceBtn.className = 'device-select-btn';
  deviceBtn.type = 'button';
  deviceBtn.title = 'Select microphone';
  deviceBtn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';

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
        opt.textContent =
          device.label || `Microphone ${deviceDropdown.children.length}`;
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

  // Name row with device button
  const nameRow = document.createElement('div');
  nameRow.className = 'name-row';
  const nameInput = document.createElement('input');
  nameInput.placeholder = 'Your name';
  nameInput.className = 'name-input';
  const savedName = localStorage.getItem('voxa-username');
  if (savedName) nameInput.value = savedName;
  nameRow.appendChild(nameInput);
  nameRow.appendChild(deviceBtn);
  nameRow.appendChild(deviceDropdown);
  wrap.appendChild(nameRow);

  const passInput = document.createElement('input');
  passInput.type = 'password';
  passInput.placeholder = 'Password (if required)';
  wrap.appendChild(passInput);

  const btn = document.createElement('button');
  btn.className = 'join-btn pulse-glow';
  btn.innerHTML = '<span>Join Room</span>';
  btn.onclick = () => {
    const selected = roomGrid.querySelector('.room-card.selected') as HTMLElement | null;
    let room: string | null = null;
    if (selected?.dataset.roomId) {
      room = selected.dataset.roomId;
    } else if (newRoomInput.value.trim()) {
      room = newRoomInput.value.trim();
    }
    const name = nameInput.value.trim();
    if (!room || !name) return;
    app.join(room, name, passInput.value || undefined);
  };
  wrap.appendChild(btn);

  createCard.onclick = () => {
    roomGrid.querySelectorAll('.room-card').forEach((c) => c.classList.remove('selected'));
    createCard.classList.add('selected');
    newRoomInput.style.display = 'none';
    createForm.style.display =
      createForm.style.display === 'none' ? 'flex' : 'none';
  };

  const createSubmit = createForm.querySelector('.create-room-submit') as HTMLButtonElement;
  createSubmit.onclick = () => {
    const nameEl = createForm.querySelector('.create-room-name') as HTMLInputElement;
    const passEl = createForm.querySelector('.create-room-password') as HTMLInputElement;
    const maxEl = createForm.querySelector('.create-room-max') as HTMLInputElement;
    const roomName = nameEl.value.trim();
    const password = passEl.value || undefined;
    const maxUsers = parseInt(maxEl.value, 10) || 10;
    if (!roomName) return;
    fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: roomName, password, maxUsers }),
    })
      .then(() => {
        app.fetchRooms();
        createForm.style.display = 'none';
        newRoomInput.style.display = 'block';
        newRoomInput.value = roomName;
      })
      .catch((err) => {
        console.error('Failed to create room:', err);
      });
  };

  container.appendChild(wrap);
  els.offlineScreen = wrap;
  els.offlineElements = { errorEl, deviceBtn, createForm };
}

function updateOfflineElements(els: OfflineElements, state: AppState): void {
  if (state.joinError) {
    els.errorEl.textContent = state.joinError;
    els.errorEl.style.display = 'block';
    els.errorEl.classList.add('shake');
    setTimeout(() => els.errorEl.classList.remove('shake'), 500);
  } else {
    els.errorEl.style.display = 'none';
    els.errorEl.textContent = '';
  }
}

function updateOfflineScreen(wrap: HTMLElement, state: AppState): void {
  let grid = wrap.querySelector('.room-grid') as HTMLElement | null;
  if (!grid) return;

  const existingIds = new Set<string>();
  grid.querySelectorAll('.room-card[data-room-id]').forEach((el) => {
    const id = (el as HTMLElement).dataset.roomId!;
    existingIds.add(id);
    const room = state.rooms.find((r) => r.id === id);
    if (!room) {
      el.remove();
    } else {
      const nameEl = el.querySelector('.room-card-name') as HTMLElement;
      const metaEl = el.querySelector('.room-card-meta') as HTMLElement;
      if (nameEl) nameEl.textContent = room.id;
      if (metaEl) {
        metaEl.innerHTML = `<span>${room.peerCount}/${room.maxUsers} users</span>${room.hasPassword ? '<span class="room-lock">&#128274;</span>' : ''}`;
      }
    }
  });

  for (const room of state.rooms) {
    if (existingIds.has(room.id)) continue;
    const card = document.createElement('div');
    card.className = 'room-card';
    card.dataset.roomId = room.id;
    card.innerHTML = `
      <div class="room-card-name">${escapeHtml(room.id)}</div>
      <div class="room-card-meta">
        <span>${room.peerCount}/${room.maxUsers} users</span>
        ${room.hasPassword ? '<span class="room-lock">&#128274;</span>' : ''}
      </div>
    `;
    card.onclick = () => {
      const g = card.parentElement;
      if (!g) return;
      g.querySelectorAll('.room-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
    };
    const createCard = grid.querySelector('.create-room');
    if (createCard) grid.insertBefore(card, createCard);
    else grid.appendChild(card);
  }

  if (state.roomsLoading && state.rooms.length === 0) {
    if (!grid.querySelector('.room-loading')) {
      grid.innerHTML = `<div class="room-loading">Loading rooms...</div>`;
      const createCard2 = document.createElement('div');
      createCard2.className = 'room-card create-room';
      createCard2.innerHTML =
        `<div class="room-card-name">+ New Room</div><div class="room-card-meta">Start a fresh conversation</div>`;
      grid.appendChild(createCard2);
      createCard2.onclick = () => {
        grid!.querySelectorAll('.room-card').forEach((c) => c.classList.remove('selected'));
        createCard2.classList.add('selected');
        const nri = wrap.querySelector('.new-room-input') as HTMLElement;
        if (nri) {
          nri.style.display = 'block';
          (nri as HTMLInputElement).focus();
        }
      };
    }
  }
}

/**
 * ─── CONNECTING SCREEN ───
 */

function renderConnectingScreen(container: HTMLElement, els: Elements): void {
  const wrap = document.createElement('div');
  wrap.className = 'connecting-state';
  wrap.innerHTML = `<div class="spinner"></div><p>Connecting...</p>`;
  container.appendChild(wrap);
  els.connectingScreen = wrap;
}
