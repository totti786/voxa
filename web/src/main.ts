import { VoiceApp } from './app.js';
import { renderApp } from './ui/app.js';

const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${protocol}//${window.location.host}/ws`;
const app = new VoiceApp(wsUrl);

const container = document.getElementById('app');
if (container) {
  renderApp(container, app);
}

app.fetchRooms();
app.startFetchRoomsLoop();

function isTypingTarget(e: Event): boolean {
  const target = e.target as HTMLElement;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (isTypingTarget(e)) return;
  if (e.key === 'm' || e.key === 'M') {
    const state = app.store.getState();
    app.setMute(!state.localMuted);
  }
  if (e.key === 'd' || e.key === 'D') {
    const state = app.store.getState();
    app.setDeafen(!state.deafened);
  }
  if (app.store.getState().pttEnabled && e.key === 'Control') {
    app.setPttActive(true);
  }
});

document.addEventListener('keyup', (e) => {
  if (isTypingTarget(e)) return;
  if (app.store.getState().pttEnabled && e.key === 'Control') {
    app.setPttActive(false);
  }
});
