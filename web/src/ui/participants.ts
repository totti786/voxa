import type { PeerInfo } from '../types.js';
import type { VoiceApp } from '../app.js';

export function renderParticipants(container: HTMLElement, peers: PeerInfo[], app: VoiceApp): void {
  container.innerHTML = '';

  const radius = 180;
  const centerX = 160;
  const centerY = 160;

  peers.forEach((peer, index) => {
    const angle = (index / Math.max(peers.length, 1)) * Math.PI * 2 - Math.PI / 2;
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
      <span class="peer-name">${escapeHtml(peer.display_name)}</span>
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

    container.appendChild(orb);
  });
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
