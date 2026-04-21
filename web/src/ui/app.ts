import { VoiceApp } from '../app.js';
import type { AppState } from '../app.js';

export function renderApp(container: HTMLElement, app: VoiceApp): void {
  function update(state: AppState) {
    container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'header';
    header.innerHTML = `
      <h1>Voice</h1>
      <div class="room-info">${state.roomId ? `Room: ${state.roomId}` : 'Not connected'}</div>
    `;
    container.appendChild(header);

    const main = document.createElement('div');
    main.className = 'main';

    if (!state.connected && !state.connecting) {
      renderJoinForm(main, app);
    } else if (state.connecting) {
      main.innerHTML = '<div>Connecting...</div>';
    } else {
      renderConnected(main, app, state);
    }

    container.appendChild(main);
  }

  app.store.subscribe(update);
  update(app.store.getState());
}

function renderJoinForm(container: HTMLElement, app: VoiceApp): void {
  const form = document.createElement('div');
  form.className = 'room-form';

  const roomInput = document.createElement('input');
  roomInput.placeholder = 'Room name';
  roomInput.value = new URLSearchParams(window.location.search).get('room') || '';

  const nameInput = document.createElement('input');
  nameInput.placeholder = 'Your name';

  const passInput = document.createElement('input');
  passInput.type = 'password';
  passInput.placeholder = 'Password (optional)';

  const btn = document.createElement('button');
  btn.className = 'connect-btn';
  btn.textContent = 'Join Room';
  btn.onclick = () => {
    const room = roomInput.value.trim();
    const name = nameInput.value.trim();
    if (!room || !name) return;
    app.join(room, name, passInput.value || undefined);
  };

  form.append(roomInput, nameInput, passInput, btn);
  container.appendChild(form);
}

function renderConnected(container: HTMLElement, app: VoiceApp, state: AppState): void {
  const canvas = document.createElement('canvas');
  canvas.className = 'waveform';
  canvas.width = 300;
  canvas.height = 80;
  container.appendChild(canvas);

  // Simple waveform animation
  const ctx = canvas.getContext('2d')!;
  function draw() {
    ctx.fillStyle = '#1a1d24';
    ctx.fillRect(0, 0, 300, 80);
    ctx.fillStyle = '#43b581';
    const bars = 30;
    for (let i = 0; i < bars; i++) {
      const h = state.localSpeaking ? Math.random() * 60 + 10 : 4;
      ctx.fillRect(i * 10 + 2, 40 - h / 2, 6, h);
    }
    requestAnimationFrame(draw);
  }
  draw();

  const btn = document.createElement('button');
  btn.className = 'connect-btn disconnect';
  btn.textContent = 'Disconnect';
  btn.onclick = () => app.leave();
  container.appendChild(btn);
}
