import { VoiceApp } from '../app.js';
import type { AppState } from '../app.js';
import type { PeerInfo, ChatMessage, MessageEntry, SystemMessageEntry } from '../types.js';
import { renderParticipants } from './participants.js';
import { renderControls } from './controls.js';

type Screen = 'offline' | 'connecting' | 'connected';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
}

interface Elements {
  headerRoomInfo: HTMLElement;
  main: HTMLElement;
  particleCanvas: HTMLCanvasElement;
  particleCtx: CanvasRenderingContext2D;
  particleAnimId: number | null;
  reconnectingOverlay: HTMLElement;
  offlineScreen?: HTMLElement;
  offlineElements?: OfflineElements;
  connectingScreen?: HTMLElement;
  connectedScreen?: ConnectedElements;
}

interface ConnectedElements {
  orbWrap: HTMLElement;
  orbRing: HTMLElement;
  orbCanvas: HTMLCanvasElement;
  orbLabel: HTMLElement;
  participants: HTMLElement;
  controls: HTMLElement;
  canvasCtx: CanvasRenderingContext2D | null;
  animId: number | null;
  chatBar: HTMLElement;
  chatDropdown: HTMLElement;
  chatMessages: HTMLElement;
  chatInput: HTMLInputElement;
  lastMessageCount: number;
  _cleanupKeyboard?: () => void;
  _cleanupChat?: () => void;
  _cleanupResize?: () => void;
}

interface OfflineElements {
  errorEl: HTMLElement;
  deviceBtn: HTMLButtonElement;
  createForm: HTMLElement | null;
}

export function renderApp(container: HTMLElement, app: VoiceApp): void {
  container.innerHTML = '';

  const particleCanvas = document.createElement('canvas');
  particleCanvas.className = 'particle-canvas';
  particleCanvas.width = window.innerWidth;
  particleCanvas.height = window.innerHeight;
  container.appendChild(particleCanvas);
  const particleCtx = particleCanvas.getContext('2d')!;

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
  reconnectingOverlay.innerHTML = '<div class="reconnecting-spinner"></div><p>Reconnecting...</p>';
  reconnectingOverlay.style.display = 'none';
  container.appendChild(reconnectingOverlay);

  const els: Elements = { headerRoomInfo, main, particleCanvas, particleCtx, particleAnimId: null, reconnectingOverlay };

  function handleResize() {
    particleCanvas.width = window.innerWidth;
    particleCanvas.height = window.innerHeight;
  }
  window.addEventListener('resize', handleResize);

  startParticles(els);

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
        renderConnectedScreen(main, els, app);
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

function createParticles(width: number, height: number): Particle[] {
  const particles: Particle[] = [];
  const count = 60;
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      size: Math.random() * 2 + 0.5,
      opacity: Math.random() * 0.3 + 0.05,
    });
  }
  return particles;
}

function startParticles(els: Elements): void {
  if (!els.particleCanvas || !els.particleCtx) return;
  const particles = createParticles(els.particleCanvas.width, els.particleCanvas.height);

  function draw() {
    const ctx = els.particleCtx!;
    const canvas = els.particleCanvas!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < -10) p.x = canvas.width + 10;
      if (p.x > canvas.width + 10) p.x = -10;
      if (p.y < -10) p.y = canvas.height + 10;
      if (p.y > canvas.height + 10) p.y = -10;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(168, 85, 247, ${p.opacity})`;
      ctx.fill();
    }

    els.particleAnimId = requestAnimationFrame(draw);
  }

  draw();
}

function clearConnected(els: Elements): void {
  const participantCloser = (els.connectedScreen?.participants as any)?.__tooltipCloser as EventListener | undefined;
  if (participantCloser) {
    document.removeEventListener('pointerdown', participantCloser);
  }
  const participantResizer = (els.connectedScreen?.participants as any)?.__rectResizer as EventListener | undefined;
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

function renderOfflineScreen(container: HTMLElement, els: Elements, app: VoiceApp): void {
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
    createForm.style.display = createForm.style.display === 'none' ? 'flex' : 'none';
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
    }).then(() => {
      app.fetchRooms();
      createForm.style.display = 'none';
      newRoomInput.style.display = 'block';
      newRoomInput.value = roomName;
    }).catch((err) => {
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
      createCard2.innerHTML = `<div class="room-card-name">+ New Room</div><div class="room-card-meta">Start a fresh conversation</div>`;
      grid.appendChild(createCard2);
      createCard2.onclick = () => {
        grid!.querySelectorAll('.room-card').forEach((c) => c.classList.remove('selected'));
        createCard2.classList.add('selected');
        const nri = wrap.querySelector('.new-room-input') as HTMLElement;
        if (nri) { nri.style.display = 'block'; (nri as HTMLInputElement).focus(); }
      };
    }
  }
}

function renderConnectingScreen(container: HTMLElement, els: Elements): void {
  const wrap = document.createElement('div');
  wrap.className = 'connecting-state';
  wrap.innerHTML = `<div class="spinner"></div><p>Connecting...</p>`;
  container.appendChild(wrap);
  els.connectingScreen = wrap;
}

function renderConnectedScreen(container: HTMLElement, els: Elements, app: VoiceApp): void {
  const layout = document.createElement('div');
  layout.className = 'connected-layout';
  container.appendChild(layout);

  const stage = document.createElement('div');
  stage.className = 'connected-stage';
  layout.appendChild(stage);

  const orbWrap = document.createElement('div');
  orbWrap.className = 'orb-container';
  stage.appendChild(orbWrap);

  const ring = document.createElement('div');
  ring.className = 'orb-ring';

  const canvas = document.createElement('canvas');
  canvas.className = 'orb-canvas';
  const dpr = window.devicePixelRatio || 1;

  const orbLabel = document.createElement('div');
  orbLabel.className = 'orb-label';

  const chatWrap = document.createElement('div');
  chatWrap.className = 'chat-wrap';

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
  chatWrap.appendChild(chatBar);

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
  chatWrap.appendChild(chatDropdown);
  layout.insertBefore(chatWrap, stage);

  orbWrap.append(ring, canvas, orbLabel);

  const participants = document.createElement('div');
  participants.className = 'participants-ring';
  orbWrap.appendChild(participants);

  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      app.sendChat(chatInput.value);
      chatInput.value = '';
    }
  });

  let isDropdownOpen = false;

  function openDropdown() {
    isDropdownOpen = true;
    chatDropdown.style.display = 'flex';
    chatChevron.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="18 15 12 9 6 15"/></svg>';
    chatBar.classList.remove('new-message');
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

  function onDocumentClick(e: MouseEvent) {
    if (!isDropdownOpen) return;
    const target = e.target as Node;
    if (!chatBar.contains(target) && !chatDropdown.contains(target)) {
      closeDropdown();
    }
  }
  document.addEventListener('click', onDocumentClick);

  const controls = document.createElement('div');
  stage.appendChild(controls);

  const ctx = canvas.getContext('2d');
  let displaySize = 264;
  let centerX = displaySize / 2;
  let centerY = displaySize / 2;
  let maxRadius = displaySize / 2 - 16;
  const barCount = 96;
  const smoothedHeights: number[] = new Array(barCount).fill(0);
  const smoothingFactor = 0.35;
  let innerRadius = maxRadius * 0.2;

  let speakingGradient: CanvasGradient | null = null;
  let silentGradient: CanvasGradient | null = null;
  let mutedGradient: CanvasGradient | null = null;

  function refreshGradients() {
    if (!ctx) return;
    speakingGradient = ctx.createRadialGradient(centerX, centerY, innerRadius, centerX, centerY, maxRadius);
    speakingGradient.addColorStop(0, 'rgba(168, 85, 247, 0.5)');
    speakingGradient.addColorStop(1, 'rgba(6, 182, 212, 0.95)');

    silentGradient = ctx.createRadialGradient(centerX, centerY, innerRadius, centerX, centerY, maxRadius);
    silentGradient.addColorStop(0, 'rgba(90, 90, 128, 0.1)');
    silentGradient.addColorStop(1, 'rgba(90, 90, 128, 0.35)');

    mutedGradient = ctx.createRadialGradient(centerX, centerY, innerRadius, centerX, centerY, maxRadius);
    mutedGradient.addColorStop(0, 'rgba(255, 107, 107, 0.2)');
    mutedGradient.addColorStop(1, 'rgba(255, 107, 107, 0.7)');
  }

  function syncVisualizerSize() {
    if (!ctx) return;
    const wrapSize = Math.max(240, Math.round(Math.min(orbWrap.clientWidth || 320, orbWrap.clientHeight || 320)));
    const inset = -32;
    displaySize = wrapSize + 64;
    canvas.style.inset = `${inset}px`;
    canvas.width = Math.round(displaySize * dpr);
    canvas.height = Math.round(displaySize * dpr);
    canvas.style.width = `${displaySize}px`;
    canvas.style.height = `${displaySize}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    centerX = displaySize / 2;
    centerY = displaySize / 2;
    maxRadius = displaySize / 2 - 8;
    innerRadius = maxRadius * 0.2;
    refreshGradients();
  }

  syncVisualizerSize();

  let animId: number | null = null;
  let lastFrameTime = 0;
  const targetFrameInterval = 1000 / 60;

  const peakHeights: number[] = new Array(barCount).fill(0);
  const peakDecay = 0.88;

  function logScaleBin(i: number, total: number, maxBin: number): number {
    const minFreq = 1;
    const logMin = Math.log(minFreq);
    const logMax = Math.log(maxBin);
    const t = i / Math.max(total - 1, 1);
    const logVal = logMin + t * (logMax - logMin);
    return Math.min(Math.floor(Math.exp(logVal)), maxBin - 1);
  }

  function draw(timestamp: number) {
    if (!ctx) return;
    if (document.hidden) {
      animId = requestAnimationFrame(draw);
      return;
    }
    if (timestamp - lastFrameTime < targetFrameInterval) {
      animId = requestAnimationFrame(draw);
      return;
    }
    lastFrameTime = timestamp;

    const data = app.getFrequencyData();
    const s = app.store.getState();
    const isSpeaking = s.localSpeaking;
    const isMuted = s.localMuted;

    ctx.clearRect(0, 0, displaySize, displaySize);

    if (data) {
      const vocalRangeBins = Math.floor(data.length * 0.35);
      
      for (let i = 0; i < barCount; i++) {
        const isLeftHalf = i < barCount / 2;
        const symmetricIndex = isLeftHalf ? i : barCount - 1 - i;
        const halfBarCount = barCount / 2;
        
        const binIndex = logScaleBin(symmetricIndex, halfBarCount, vocalRangeBins);
        const value = data[binIndex] / 255;
        const targetHeight = value * maxRadius * 0.22;
        smoothedHeights[i] += (targetHeight - smoothedHeights[i]) * smoothingFactor;
        const barHeight = smoothedHeights[i];

        if (barHeight > peakHeights[i]) {
          peakHeights[i] = barHeight;
        } else {
          peakHeights[i] *= peakDecay;
        }
      }

      const baseRadius = maxRadius - 32;
      const interpPoints = 64;
      const totalPoints = barCount * interpPoints;

      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < totalPoints; i++) {
        const t = i / totalPoints;
        const angle = t * Math.PI * 2 - Math.PI / 2;
        const binF = t * barCount;
        const idx = Math.floor(binF) % barCount;
        const nxt = (idx + 1) % barCount;
        const f = binF - Math.floor(binF);
        const h = smoothedHeights[idx] * (1 - f) + smoothedHeights[nxt] * f;
        const r = baseRadius + h;
        pts.push({
          x: centerX + Math.cos(angle) * r,
          y: centerY + Math.sin(angle) * r,
        });
      }

      ctx.save();
      if (isMuted) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
        ctx.shadowColor = 'rgba(239, 68, 68, 0.6)';
      } else if (isSpeaking) {
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.95)';
        ctx.shadowColor = 'rgba(168, 85, 247, 0.5)';
      } else {
        ctx.strokeStyle = 'rgba(90, 90, 128, 0.5)';
        ctx.shadowColor = 'rgba(90, 90, 128, 0.2)';
      }
      ctx.shadowBlur = isSpeaking ? 24 : 14;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const p0 = pts[(i - 1 + n) % n];
        const p1 = pts[i];
        const p2 = pts[(i + 1) % n];
        const p3 = pts[(i + 2) % n];
        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;
        if (i === 0) ctx.moveTo(p1.x, p1.y);
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
      }
      ctx.stroke();

      ctx.shadowBlur = isSpeaking ? 12 : 6;
      ctx.lineWidth = 2;
      ctx.strokeStyle = isMuted
        ? 'rgba(255, 160, 160, 0.6)'
        : isSpeaking
          ? 'rgba(200, 160, 255, 0.7)'
          : 'rgba(130, 130, 170, 0.35)';
      ctx.stroke();

      ctx.restore();
    }

    animId = requestAnimationFrame(draw);
  }

  if (ctx) {
    animId = requestAnimationFrame(draw);
  }

  const connected: ConnectedElements = {
    orbWrap, orbRing: ring, orbCanvas: canvas, orbLabel, participants, controls,
    canvasCtx: ctx, animId, chatBar, chatDropdown, chatMessages, chatInput, lastMessageCount: 0,
  };

  orbWrap.onpointerdown = (e) => {
    if (app.store.getState().pttEnabled) {
      e.preventDefault();
      app.setPttActive(true);
    }
  };
  orbWrap.onpointerup = () => {
    if (app.store.getState().pttEnabled) {
      app.setPttActive(false);
    }
  };
  orbWrap.onpointerleave = () => {
    if (app.store.getState().pttEnabled) {
      app.setPttActive(false);
    }
  };
  orbWrap.onclick = () => {
    if (!app.store.getState().pttEnabled) {
      app.setMute(!app.store.getState().localMuted);
    }
  };
  els.connectedScreen = connected;

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
  window.addEventListener('resize', syncVisualizerSize);

  (connected as any)._cleanupKeyboard = () => {
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
  };

  (connected as any)._cleanupChat = () => {
    document.removeEventListener('click', onDocumentClick);
  };

  (connected as any)._cleanupResize = () => {
    window.removeEventListener('resize', syncVisualizerSize);
  };
}

function updateConnected(els: ConnectedElements, state: AppState, app: VoiceApp): void {
  els.orbWrap.className = 'orb-container' + (state.localSpeaking ? '' : ' idle');
  els.orbWrap.querySelectorAll('.orb-ring').forEach((ring) => {
    let modifier = '';
    if (state.localMuted) {
      modifier = ' muted';
    } else if (state.pttActive) {
      modifier = ' ptt-active';
    } else if (state.localSpeaking) {
      modifier = ' active';
    }
    ring.className = 'orb-ring' + modifier;
  });

  let label = '';
  if (state.pttEnabled) {
    label = state.localMuted ? 'Muted' : state.pttActive ? 'Talking...' : 'Hold to talk';
  } else {
    label = state.localMuted ? 'Muted — Click to unmute' : 'Click to mute';
  }
  els.orbLabel.textContent = label;

  renderParticipants(els.participants, state.peers, app, state.roomId ?? '');
  renderControls(els.controls, app, state);

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
      setTimeout(() => els.chatBar.classList.remove('new-message'), 1500);
    }
    // Auto-scroll only if at bottom
    const isAtBottom = els.chatMessages.scrollHeight - els.chatMessages.scrollTop <= els.chatMessages.clientHeight + 10;
    if (isAtBottom) {
      els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
    }
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

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
