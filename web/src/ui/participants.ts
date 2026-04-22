import type { PeerInfo } from '../types.js';
import type { VoiceApp } from '../app.js';

export function renderParticipants(container: HTMLElement, peers: PeerInfo[], app: VoiceApp): void {
  container.innerHTML = '';

  const radius = 160;
  const centerX = 140;
  const centerY = 140;

  peers.forEach((peer, index) => {
    const angle = (index / Math.max(peers.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const x = centerX + Math.cos(angle) * radius - 28;
    const y = centerY + Math.sin(angle) * radius - 28;

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
      <span class="volume-tooltip">${peer.display_name}</span>
    `;

    container.appendChild(orb);
  });
}
