import { VoiceApp } from '../app.js';
import type { AppState } from '../app.js';
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
  offlineScreen?: HTMLElement;
  connectingScreen?: HTMLElement;
  connectedScreen?: ConnectedElements;
}

interface ConnectedElements {
  orbWrap: HTMLElement;
  orbCanvas: HTMLCanvasElement;
  orbLabel: HTMLElement;
  participants: HTMLElement;
  controls: HTMLElement;
  canvasCtx: CanvasRenderingContext2D;
  animId: number | null;
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
  header.innerHTML = `<h1>Voice</h1>`;
  const headerRoomInfo = document.createElement('div');
  headerRoomInfo.className = 'room-info';
  headerRoomInfo.textContent = 'OFFLINE';
  header.appendChild(headerRoomInfo);
  container.appendChild(header);

  const main = document.createElement('div');
  main.className = 'main';
  container.appendChild(main);

  const els: Elements = { headerRoomInfo, main, particleCanvas, particleCtx, particleAnimId: null };

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
      ctx.fillStyle = `rgba(255, 159, 67, ${p.opacity})`;
      ctx.fill();
    }

    els.particleAnimId = requestAnimationFrame(draw);
  }

  draw();
}

function clearConnected(els: Elements): void {
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
    <div class="hero-title">VOICE</div>
    <div class="hero-subtitle">Join the conversation</div>
  `;

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

  const newRoomInput = document.createElement('input');
  newRoomInput.className = 'new-room-input';
  newRoomInput.placeholder = 'Room name';
  newRoomInput.style.display = 'none';
  wrap.appendChild(newRoomInput);

  const nameInput = document.createElement('input');
  nameInput.placeholder = 'Your name';
  wrap.appendChild(nameInput);

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
    newRoomInput.style.display = 'block';
    newRoomInput.focus();
  };

  container.appendChild(wrap);
  els.offlineScreen = wrap;
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
  const orbWrap = document.createElement('div');
  orbWrap.className = 'orb-container';

  const orbRing1 = document.createElement('div');
  orbRing1.className = 'orb-ring';
  const orbRing2 = document.createElement('div');
  orbRing2.className = 'orb-ring';
  const orbRing3 = document.createElement('div');
  orbRing3.className = 'orb-ring';

  const canvas = document.createElement('canvas');
  canvas.className = 'orb-canvas';
  canvas.width = 304;
  canvas.height = 304;

  const orbLabel = document.createElement('div');
  orbLabel.className = 'orb-label';

  orbWrap.append(orbRing1, orbRing2, orbRing3, canvas, orbLabel);
  container.appendChild(orbWrap);

  const participants = document.createElement('div');
  participants.className = 'participants-ring';
  orbWrap.appendChild(participants);

  const controls = document.createElement('div');
  container.appendChild(controls);

  const ctx = canvas.getContext('2d')!;
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const maxRadius = canvas.width / 2 - 12;
  const barCount = 64;
  let animId: number | null = null;

  function draw() {
    const data = app.getFrequencyData();
    const s = app.store.getState();
    const isSpeaking = s.localSpeaking;
    const isMuted = s.localMuted;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (data) {
      const step = Math.floor(data.length / barCount);
      for (let i = 0; i < barCount; i++) {
        const value = data[i * step] / 255;
        const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
        const barHeight = value * maxRadius * 0.6;
        const x1 = centerX + Math.cos(angle) * (maxRadius * 0.35);
        const y1 = centerY + Math.sin(angle) * (maxRadius * 0.35);
        const x2 = centerX + Math.cos(angle) * (maxRadius * 0.35 + barHeight);
        const y2 = centerY + Math.sin(angle) * (maxRadius * 0.35 + barHeight);
        const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
        if (isMuted) {
          gradient.addColorStop(0, 'rgba(255, 107, 107, 0.3)');
          gradient.addColorStop(1, 'rgba(255, 107, 107, 0.8)');
        } else if (isSpeaking) {
          gradient.addColorStop(0, 'rgba(255, 159, 67, 0.4)');
          gradient.addColorStop(1, 'rgba(254, 202, 87, 0.9)');
        } else {
          gradient.addColorStop(0, 'rgba(138, 127, 117, 0.15)');
          gradient.addColorStop(1, 'rgba(138, 127, 117, 0.4)');
        }
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }

    if (isSpeaking && !isMuted) {
      const base = data ? data[0] / 255 : 0;
      const glowRadius = maxRadius * 0.35 + base * 20;
      const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, glowRadius);
      glow.addColorStop(0, 'rgba(255, 159, 67, 0.15)');
      glow.addColorStop(1, 'rgba(255, 159, 67, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    animId = requestAnimationFrame(draw);
  }

  animId = requestAnimationFrame(draw);

  const connected: ConnectedElements = {
    orbWrap, orbCanvas: canvas, orbLabel, participants, controls,
    canvasCtx: ctx, animId,
  };

  orbWrap.onclick = () => app.setMute(!app.store.getState().localMuted);
  els.connectedScreen = connected;
}

function updateConnected(els: ConnectedElements, state: AppState, app: VoiceApp): void {
  els.orbWrap.className = 'orb-container' + (state.localSpeaking ? '' : ' idle');
  els.orbWrap.querySelectorAll('.orb-ring').forEach((ring) => {
    ring.className = 'orb-ring' + (state.localMuted ? ' muted' : state.localSpeaking ? ' active' : '');
  });
  els.orbLabel.textContent = state.localMuted ? 'Muted — Click to unmute' : 'Click to mute';

  renderParticipants(els.participants, state.peers, app);
  renderControls(els.controls, app, state);
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
