import type { PeerInfo } from '../types.js';
import type { VoiceApp } from '../app.js';

function setSliderValue(el: HTMLInputElement, value: number): void {
  el.value = String(value);
  const min = parseFloat(el.min) || 0;
  const max = parseFloat(el.max) || 100;
  const pct = ((value - min) / (max - min)) * 100;
  el.style.setProperty('--value', `${pct}%`);
}

function attachWheel(el: HTMLInputElement, step = 1): void {
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = Math.sign(e.deltaY) * -step;
    const min = parseFloat(el.min) || 0;
    const max = parseFloat(el.max) || 100;
    let val = parseFloat(el.value) + delta;
    val = Math.max(min, Math.min(max, val));
    setSliderValue(el, val);
    el.dispatchEvent(new Event('input'));
  }, { passive: false });
}

function getOrbAnglesKey(roomId: string): string {
  return `voxa-orb-pos:${roomId}`;
}

function loadOrbAngles(roomId: string): Map<string, number> {
  try {
    const raw = localStorage.getItem(getOrbAnglesKey(roomId));
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, number>;
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

function saveOrbAngles(roomId: string, angles: Map<string, number>): void {
  const obj = Object.fromEntries(angles);
  localStorage.setItem(getOrbAnglesKey(roomId), JSON.stringify(obj));
}

export function renderParticipants(container: HTMLElement, peers: PeerInfo[], app: VoiceApp, roomId: string): void {
  const prevCloser = (container as any).__tooltipCloser as EventListener | undefined;
  if (prevCloser) {
    document.removeEventListener('pointerdown', prevCloser);
  }
  container.innerHTML = '';

  const radius = 180;
  const centerX = 160;
  const centerY = 160;

  const storedAngles = loadOrbAngles(roomId);
  const currentPeerIds = new Set(peers.map((p) => p.id));

  for (const peerId of storedAngles.keys()) {
    if (!currentPeerIds.has(peerId)) {
      storedAngles.delete(peerId);
    }
  }

  let cachedCx = 0;
  let cachedCy = 0;
  function updateCachedRect(): void {
    const rect = container.getBoundingClientRect();
    cachedCx = rect.left + rect.width / 2;
    cachedCy = rect.top + rect.height / 2;
  }
  updateCachedRect();

  const prevResizer = (container as any).__rectResizer as EventListener | undefined;
  if (prevResizer) {
    window.removeEventListener('resize', prevResizer);
  }
  window.addEventListener('resize', updateCachedRect);
  (container as any).__rectResizer = updateCachedRect;

  peers.forEach((peer, index) => {
    let angle = storedAngles.get(peer.id);
    if (angle === undefined) {
      const unpositionedPeers = peers.filter((p) => !storedAngles.has(p.id));
      const unpositionedIndex = unpositionedPeers.findIndex((p) => p.id === peer.id);
      angle = (unpositionedIndex / Math.max(unpositionedPeers.length, 1)) * Math.PI * 2 - Math.PI / 2;
    }
    const x = centerX + Math.cos(angle) * radius - 32;
    const y = centerY + Math.sin(angle) * radius - 32;

    const orb = document.createElement('div');
    orb.className = 'peer-orb' + (peer.speaking ? ' speaking' : '') + (peer.muted ? ' muted' : '');
    orb.style.left = `${x}px`;
    orb.style.top = `${y}px`;

    const initials = peer.display_name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    const state = app.store.getState();
    const isLocalOwner = state.localIsOwner;
    const isSelf = peer.id === state.selfPeerId;

    const crownSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z"/><path d="M5 16h14v3H5z"/></svg>`;
    const lockSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
    const kickIconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/></svg>`;
    const muteIconSvg = peer.force_muted
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v6a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;

    let adminButtonsHtml = '';
    if (isLocalOwner && !isSelf) {
      adminButtonsHtml = `
        <div class="admin-actions">
          <button class="admin-btn admin-kick" title="Kick">${kickIconSvg}</button>
          <button class="admin-btn admin-mute" title="${peer.force_muted ? 'Unmute' : 'Force mute'}">${muteIconSvg}</button>
        </div>
      `;
    }

    orb.innerHTML = `
      <span class="peer-initials">${initials}</span>
      ${peer.is_owner ? `<span class="orb-badge orb-crown">${crownSvg}</span>` : ''}
      ${peer.force_muted ? `<span class="orb-badge orb-lock">${lockSvg}</span>` : ''}
      <span class="peer-status"></span>
      <span class="volume-tooltip">
        <span class="tooltip-name">${escapeHtml(peer.display_name)}</span>
        ${adminButtonsHtml}
        <input type="range" class="peer-volume-slider" min="0" max="200" value="${Math.round((app.peerVolumes.get(peer.id) ?? 1) * 100)}">
      </span>
    `;

    const volSlider = orb.querySelector('.peer-volume-slider') as HTMLInputElement;
    setSliderValue(volSlider, (app.peerVolumes.get(peer.id) ?? 1) * 100);
    volSlider.oninput = (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10) / 100;
      setSliderValue(volSlider, val * 100);
      app.setPeerVolume(peer.id, val);
    };
    attachWheel(volSlider, 5);

    if (isLocalOwner && !isSelf) {
      const kickBtn = orb.querySelector('.admin-kick');
      if (kickBtn) {
        kickBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          app.kickPeer(peer.id);
        });
      }
      const muteBtn = orb.querySelector('.admin-mute');
      if (muteBtn) {
        muteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          app.forceMutePeer(peer.id, !peer.force_muted);
        });
      }
    }

    let isDragging = false;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let touchHasDragged = false;

    function isInsideTooltip(e: PointerEvent): boolean {
      return !!(e.target as HTMLElement).closest('.volume-tooltip');
    }

    orb.addEventListener('pointerdown', (e) => {
      if (isInsideTooltip(e)) return;
      if (e.pointerType === 'touch') {
        touchStartX = e.clientX;
        touchStartY = e.clientY;
        touchStartTime = Date.now();
        touchHasDragged = false;
      } else {
        isDragging = true;
        orb.setPointerCapture(e.pointerId);
        orb.classList.add('dragging');
      }
    });

    orb.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' && !isDragging) {
        const moveDist = Math.hypot(e.clientX - touchStartX, e.clientY - touchStartY);
        if (moveDist > 6) {
          touchHasDragged = true;
          isDragging = true;
          orb.setPointerCapture(e.pointerId);
          orb.classList.add('dragging');
        }
      }
      if (!isDragging) return;
      const cx = cachedCx;
      const cy = cachedCy;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const newAngle = Math.atan2(dy, dx);

      const newX = centerX + Math.cos(newAngle) * radius - 32;
      const newY = centerY + Math.sin(newAngle) * radius - 32;
      orb.style.left = `${newX}px`;
      orb.style.top = `${newY}px`;

      storedAngles.set(peer.id, newAngle);
    });

    orb.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch' && !isDragging) {
        const elapsed = Date.now() - touchStartTime;
        const moveDist = Math.hypot(e.clientX - touchStartX, e.clientY - touchStartY);
        if (elapsed < 350 && moveDist < 10) {
          const isVisible = orb.classList.contains('tooltip-visible');
          container.querySelectorAll('.peer-orb.tooltip-visible').forEach((o) => {
            if (o !== orb) o.classList.remove('tooltip-visible');
          });
          orb.classList.toggle('tooltip-visible', !isVisible);
        }
        return;
      }
      if (!isDragging) return;
      isDragging = false;
      orb.classList.remove('dragging');
      saveOrbAngles(roomId, storedAngles);
    });

    orb.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'touch') return;
      if (!isDragging) return;
      isDragging = false;
      orb.classList.remove('dragging');
      saveOrbAngles(roomId, storedAngles);
    });

    volSlider.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
    });

    container.appendChild(orb);
  });

  const closeTooltips = (e: PointerEvent) => {
    if (!(e.target as HTMLElement).closest('.peer-orb')) {
      container.querySelectorAll('.peer-orb.tooltip-visible').forEach((o) => {
        o.classList.remove('tooltip-visible');
      });
    }
  };
  document.addEventListener('pointerdown', closeTooltips);
  (container as any).__tooltipCloser = closeTooltips;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
