import { VoiceApp } from '../app.js';
import type { AppState } from '../app.js';
import { renderParticipants } from './participants.js';
import { renderControls } from './controls.js';

export function renderApp(container: HTMLElement, app: VoiceApp): void {
  let animationId: number | null = null;

  function update(state: AppState) {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }

    container.innerHTML = '';

    const ambient = document.createElement('div');
    ambient.className = 'ambient-glow';
    container.appendChild(ambient);

    const header = document.createElement('div');
    header.className = 'header';
    header.innerHTML = `
      <h1>Voice</h1>
      <div class="room-info">${state.roomId ? state.roomId : 'OFFLINE'}</div>
    `;
    container.appendChild(header);

    const main = document.createElement('div');
    main.className = 'main';

    if (!state.connected && !state.connecting) {
      renderJoinForm(main, app, state);
      app.fetchRooms();
    } else if (state.connecting) {
      renderConnecting(main);
    } else {
      renderConnected(main, app, state, (id) => { animationId = id; });
    }

    container.appendChild(main);
  }

  app.store.subscribe(update);
  update(app.store.getState());
}

function renderJoinForm(container: HTMLElement, app: VoiceApp, state: AppState): void {
  const form = document.createElement('div');
  form.className = 'join-form';

  form.innerHTML = `
    <h2>Join the Conversation</h2>
    <p>Select an active room or create a new one</p>
  `;

  const roomGrid = document.createElement('div');
  roomGrid.className = 'room-grid';

  if (state.roomsLoading) {
    roomGrid.innerHTML = `<div class="room-loading">Loading rooms...</div>`;
  } else if (state.rooms.length === 0) {
    roomGrid.innerHTML = `<div class="room-empty">No active rooms yet. Create one below.</div>`;
  } else {
    for (const room of state.rooms) {
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
        roomGrid.querySelectorAll('.room-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
      };
      roomGrid.appendChild(card);
    }
  }

  const createCard = document.createElement('div');
  createCard.className = 'room-card create-room';
  createCard.innerHTML = `
    <div class="room-card-name">+ New Room</div>
    <div class="room-card-meta">Start a fresh conversation</div>
  `;
  createCard.onclick = () => {
    roomGrid.querySelectorAll('.room-card').forEach((c) => c.classList.remove('selected'));
    createCard.classList.add('selected');
    newRoomInput.style.display = 'block';
    newRoomInput.focus();
  };
  roomGrid.appendChild(createCard);

  const newRoomInput = document.createElement('input');
  newRoomInput.className = 'new-room-input';
  newRoomInput.placeholder = 'Room name';
  newRoomInput.style.display = 'none';

  const nameInput = document.createElement('input');
  nameInput.placeholder = 'Your name';

  const passInput = document.createElement('input');
  passInput.type = 'password';
  passInput.placeholder = 'Password (if required)';

  const btn = document.createElement('button');
  btn.className = 'join-btn';
  btn.textContent = 'Join Room';
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

  form.append(roomGrid, newRoomInput, nameInput, passInput, btn);
  container.appendChild(form);
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderConnecting(container: HTMLElement): void {
  const wrap = document.createElement('div');
  wrap.className = 'connecting-state';
  wrap.innerHTML = `
    <div class="spinner"></div>
    <p>Connecting...</p>
  `;
  container.appendChild(wrap);
}

function renderConnected(
  container: HTMLElement,
  app: VoiceApp,
  state: AppState,
  setAnimId: (id: number) => void
): void {
  const orbWrap = document.createElement('div');
  orbWrap.className = 'orb-container' + (state.localSpeaking ? '' : ' idle');

  const ring = document.createElement('div');
  ring.className = 'orb-ring' + (state.localMuted ? ' muted' : state.localSpeaking ? ' active' : '');

  const canvas = document.createElement('canvas');
  canvas.className = 'orb-canvas';
  canvas.width = 264;
  canvas.height = 264;

  const label = document.createElement('div');
  label.className = 'orb-label';
  label.textContent = state.localMuted ? 'Muted — Click to unmute' : 'Click to mute';

  orbWrap.append(ring, canvas, label);
  container.appendChild(orbWrap);

  orbWrap.onclick = () => app.setMute(!state.localMuted);

  const participants = document.createElement('div');
  participants.className = 'participants-ring';
  renderParticipants(participants, state.peers, app);
  orbWrap.appendChild(participants);

  const controls = document.createElement('div');
  renderControls(controls, app, state);
  container.appendChild(controls);

  const ctx = canvas.getContext('2d')!;
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const maxRadius = canvas.width / 2 - 12;
  const barCount = 64;

  function draw() {
    const data = app.getFrequencyData();
    const isSpeaking = app.store.getState().localSpeaking;
    const isMuted = app.store.getState().localMuted;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!data) {
      const id = requestAnimationFrame(draw);
      setAnimId(id);
      return;
    }

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
        gradient.addColorStop(0, 'rgba(255, 71, 87, 0.3)');
        gradient.addColorStop(1, 'rgba(255, 71, 87, 0.8)');
      } else if (isSpeaking) {
        gradient.addColorStop(0, 'rgba(0, 212, 255, 0.4)');
        gradient.addColorStop(1, 'rgba(0, 212, 255, 0.9)');
      } else {
        gradient.addColorStop(0, 'rgba(0, 212, 255, 0.15)');
        gradient.addColorStop(1, 'rgba(0, 212, 255, 0.4)');
      }

      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    if (isSpeaking && !isMuted) {
      const glowRadius = maxRadius * 0.35 + (data[0] / 255) * 20;
      const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, glowRadius);
      glow.addColorStop(0, 'rgba(0, 212, 255, 0.15)');
      glow.addColorStop(1, 'rgba(0, 212, 255, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const id = requestAnimationFrame(draw);
    setAnimId(id);
  }

  const id = requestAnimationFrame(draw);
  setAnimId(id);
}
