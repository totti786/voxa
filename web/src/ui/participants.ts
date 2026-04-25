import type { PeerInfo } from '../types.js';
import type { VoiceApp } from '../app.js';

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

    orb.innerHTML = `
      <span class="peer-initials">${initials}</span>
      <span class="peer-status"></span>
      <span class="volume-tooltip">
        <span class="tooltip-name">${escapeHtml(peer.display_name)}</span>
        <input type="range" class="peer-volume-slider" min="0" max="200" value="${Math.round((app.peerVolumes.get(peer.id) ?? 1) * 100)}">
      </span>
    `;

    const volSlider = orb.querySelector('.peer-volume-slider') as HTMLInputElement;
    volSlider.oninput = (e) => {
      const val = parseInt((e.target as HTMLInputElement).value, 10) / 100;
      app.setPeerVolume(peer.id, val);
    };

    let isDragging = false;

    orb.addEventListener('pointerdown', (e) => {
      isDragging = true;
      orb.setPointerCapture(e.pointerId);
      orb.classList.add('dragging');
    });

    orb.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const rect = container.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const newAngle = Math.atan2(dy, dx);

      const newX = centerX + Math.cos(newAngle) * radius - 32;
      const newY = centerY + Math.sin(newAngle) * radius - 32;
      orb.style.left = `${newX}px`;
      orb.style.top = `${newY}px`;

      storedAngles.set(peer.id, newAngle);
    });

    orb.addEventListener('pointerup', () => {
      if (!isDragging) return;
      isDragging = false;
      orb.classList.remove('dragging');
      saveOrbAngles(roomId, storedAngles);
    });

    orb.addEventListener('pointerleave', () => {
      if (!isDragging) return;
      isDragging = false;
      orb.classList.remove('dragging');
      saveOrbAngles(roomId, storedAngles);
    });

    container.appendChild(orb);
  });
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
