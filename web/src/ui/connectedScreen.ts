import type { VoiceApp, AppState } from '../app.js';
import type { PeerInfo } from '../types.js';
import { renderParticipants } from './participants.js';
import { renderControls } from './controls.js';
import { renderChatMessages, getSystemMessageText } from './chat.js';

export interface ConnectedElements {
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function logScaleBinPosition(t: number, maxBin: number): number {
  const safeMax = Math.max(2, maxBin);
  const minBin = 1;
  const logMin = Math.log(minBin);
  const logMax = Math.log(safeMax);
  const logVal = logMin + t * (logMax - logMin);
  return clamp(Math.exp(logVal), minBin, safeMax - 1);
}

function sampleFrequency(data: Uint8Array, binPosition: number): number {
  const clamped = clamp(binPosition, 0, data.length - 1);
  const lo = Math.floor(clamped);
  const hi = Math.min(lo + 1, data.length - 1);
  const mix = clamped - lo;
  const value = data[lo] * (1 - mix) + data[hi] * mix;
  return value / 255;
}

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    (el as HTMLElement).isContentEditable
  );
}

export function renderConnectedScreen(
  container: HTMLElement,
  app: VoiceApp
): ConnectedElements {
  const dpr = window.devicePixelRatio || 1;
  const barCount = 96;

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

  const orbLabel = document.createElement('div');
  orbLabel.className = 'orb-label';

  // -- Chat bar + dropdown --
  const chatWrap = document.createElement('div');
  chatWrap.className = 'chat-wrap';

  const chatBar = document.createElement('div');
  chatBar.className = 'chat-bar';

  const chatIcon = document.createElement('span');
  chatIcon.className = 'chat-bar-icon';
  chatIcon.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  const chatPreview = document.createElement('span');
  chatPreview.className = 'chat-bar-preview empty';
  chatPreview.textContent = 'No messages yet';

  const chatChevron = document.createElement('span');
  chatChevron.className = 'chat-bar-chevron';
  const chevronDown =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg>';
  const chevronUp =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="18 15 12 9 6 15"/></svg>';
  chatChevron.innerHTML = chevronDown;

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

  // -- Chat dropdown toggle --
  let isDropdownOpen = false;

  function openDropdown() {
    isDropdownOpen = true;
    chatDropdown.style.display = 'flex';
    chatChevron.innerHTML = chevronUp;
    chatBar.classList.remove('new-message');
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function closeDropdown() {
    isDropdownOpen = false;
    chatDropdown.style.display = 'none';
    chatChevron.innerHTML = chevronDown;
  }

  chatBar.onclick = () => {
    if (isDropdownOpen) closeDropdown();
    else openDropdown();
  };

  function onDocumentClick(e: MouseEvent) {
    if (!isDropdownOpen) return;
    const target = e.target as Node;
    if (!chatBar.contains(target) && !chatDropdown.contains(target)) {
      closeDropdown();
    }
  }
  document.addEventListener('click', onDocumentClick);

  // -- Controls container --
  const controls = document.createElement('div');
  stage.appendChild(controls);

  // -- Canvas / orb visualizer --
  const ctx = canvas.getContext('2d');
  let displaySize = 264;
  let centerX = displaySize / 2;
  let centerY = displaySize / 2;
  let maxRadius = displaySize / 2 - 16;
  const smoothedHeights: number[] = new Array(barCount).fill(0);
  const bandPhaseOffsets: number[] = Array.from(
    { length: barCount },
    () => Math.random() * Math.PI * 2
  );
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
    const wrapSize = Math.max(
      240,
      Math.round(Math.min(orbWrap.clientWidth || 320, orbWrap.clientHeight || 320))
    );
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
  let sampleRotationPhase = 0;
  let ambientTime = 0;

  function drawSmoothLoop(points: Array<{ x: number; y: number }>): void {
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const p0 = points[(i - 1 + n) % n];
      const p1 = points[i];
      const p2 = points[(i + 1) % n];
      const p3 = points[(i + 2) % n];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      if (i === 0) ctx?.moveTo(p1.x, p1.y);
      ctx?.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
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
    const frameDelta =
      lastFrameTime === 0 ? targetFrameInterval : timestamp - lastFrameTime;
    const dt = clamp(frameDelta, targetFrameInterval, 80);
    lastFrameTime = timestamp;
    ambientTime += dt;

    const data = app.getFrequencyData();
    const s = app.store.getState();
    const isSpeaking = s.localSpeaking;
    const isMuted = s.localMuted;

    ctx.clearRect(0, 0, displaySize, displaySize);

    if (data) {
      const usableBins = clamp(Math.floor(data.length * 0.72), 16, data.length);
      let energyAccumulator = 0;
      const energyEnd = Math.max(8, Math.floor(usableBins * 0.35));
      for (let i = 1; i < energyEnd; i++) {
        energyAccumulator += data[i];
      }
      const averageEnergy = (energyAccumulator / (energyEnd - 1)) / 255;
      const energy = Math.pow(clamp(averageEnergy, 0, 1), 0.65);
      const baseRadius = maxRadius - 44;

      for (let i = 0; i < barCount; i++) {
        const t = (i + 0.5) / barCount;
        const centerBin = logScaleBinPosition(t, usableBins - 1);

        // Narrow sampling — each band is more independent
        const value = sampleFrequency(data, centerBin);

        // Aggressive curve: quiet stays flat, loud spikes sharply
        const shaped = Math.pow(value, 1.6) * (1.2 + energy * 0.8);
        const ambientMotion =
          (Math.sin(ambientTime * 0.001 + bandPhaseOffsets[i]) * 0.5 + 0.5) * 2;
        const reactiveHeight = shaped * (maxRadius * 0.55);
        const targetHeight =
          reactiveHeight + ambientMotion * (1 - Math.min(value * 2.5, 1));
        // Very fast attack, moderate decay — spikes pop then fade
        const smoothing = targetHeight > smoothedHeights[i] ? 0.7 : 0.15;
        smoothedHeights[i] += (targetHeight - smoothedHeights[i]) * smoothing;
      }

      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < barCount; i++) {
        const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
        const h = smoothedHeights[i];
        const r = baseRadius + h;
        pts.push({
          x: centerX + Math.cos(angle) * r,
          y: centerY + Math.sin(angle) * r,
        });
      }

      ctx.save();

      // Inner glow layer
      const glowGradient = isMuted
        ? mutedGradient ?? 'rgba(255, 107, 107, 0.15)'
        : isSpeaking
          ? speakingGradient ?? 'rgba(168, 85, 247, 0.15)'
          : silentGradient ?? 'rgba(90, 90, 128, 0.08)';

      ctx.beginPath();
      drawSmoothLoop(pts);
      ctx.closePath();
      ctx.globalAlpha = isMuted ? 0.35 : isSpeaking ? 0.3 : 0.12;
      ctx.fillStyle = glowGradient;
      ctx.fill();

      // Outer stroke with glow
      ctx.globalAlpha = 1;
      if (isMuted) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
        ctx.shadowColor = 'rgba(239, 68, 68, 0.7)';
      } else if (isSpeaking) {
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.95)';
        ctx.shadowColor = 'rgba(168, 85, 247, 0.6)';
      } else {
        ctx.strokeStyle = 'rgba(100, 100, 140, 0.45)';
        ctx.shadowColor = 'rgba(100, 100, 140, 0.2)';
      }
      ctx.shadowBlur = isSpeaking ? 28 : isMuted ? 20 : 10;
      ctx.lineWidth = isSpeaking ? 3 : 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      drawSmoothLoop(pts);
      ctx.closePath();
      ctx.stroke();

      // Inner highlight stroke
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = isSpeaking ? 0.6 : 0.3;
      ctx.strokeStyle = isMuted
        ? 'rgba(255, 180, 180, 0.5)'
        : isSpeaking
          ? 'rgba(220, 180, 255, 0.6)'
          : 'rgba(140, 140, 180, 0.25)';
      ctx.stroke();

      ctx.restore();
    }

    animId = requestAnimationFrame(draw);
  }

  if (ctx) {
    animId = requestAnimationFrame(draw);
  }

  // -- Keyboard shortcuts --
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

  // -- Orb click handlers --
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
    const s = app.store.getState();
    if (s.audioDegraded) {
      app.handleForegroundResume();
    } else if (!s.pttEnabled) {
      app.setMute(!s.localMuted);
    }
  };

  const connected: ConnectedElements = {
    orbWrap,
    orbRing: ring,
    orbCanvas: canvas,
    orbLabel,
    participants,
    controls,
    canvasCtx: ctx,
    animId,
    chatBar,
    chatDropdown,
    chatMessages,
    chatInput,
    lastMessageCount: 0,
  };

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

  return connected;
}

export function updateConnected(
  els: ConnectedElements,
  state: AppState,
  app: VoiceApp
): void {
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
  if (state.audioDegraded) {
    label += ' ⚠';
  }
  els.orbLabel.textContent = label;

  // Toast messages
  let toastEl = document.getElementById('voxa-toast');
  if (state.toast) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'voxa-toast';
      toastEl.className = 'toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = state.toast;
    toastEl.classList.add('visible');
    clearTimeout((toastEl as any)._timeout);
    (toastEl as any)._timeout = setTimeout(() => toastEl?.classList.remove('visible'), 4000);
  } else if (toastEl) {
    toastEl.classList.remove('visible');
  }

  // Render participants and controls
  renderParticipants(els.participants, state.peers, app, state.roomId ?? '');
  renderControls(els.controls, app, state);

  if (state.messages.length !== els.lastMessageCount) {
    els.lastMessageCount = state.messages.length;
    renderChatMessages(els.chatMessages, state.messages, state.peers, state.displayName);

    const latest = state.messages[state.messages.length - 1];
    const previewEl = els.chatBar.querySelector('.chat-bar-preview') as HTMLElement;
    if (previewEl && latest) {
      if (latest.type === 'chat') {
        const peer = state.peers.find((p: PeerInfo) => p.id === latest.peer_id);
        const name =
          latest.peer_id === 'self'
            ? state.displayName
            : (peer?.display_name ?? 'Unknown');
        previewEl.textContent = `${name}: ${latest.text}`;
        previewEl.classList.remove('empty');
      } else {
        previewEl.textContent = getSystemMessageText(latest, state.peers, state.displayName);
        previewEl.classList.remove('empty');
      }
    }

    if (
      els.chatDropdown.style.display === 'none' &&
      latest &&
      latest.type === 'chat'
    ) {
      els.chatBar.classList.add('new-message');
      setTimeout(() => els.chatBar.classList.remove('new-message'), 1500);
    }

    const isAtBottom =
      els.chatMessages.scrollHeight - els.chatMessages.scrollTop <=
      els.chatMessages.clientHeight + 10;
    if (isAtBottom) {
      els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
    }
  }
}
