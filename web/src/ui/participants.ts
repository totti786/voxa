import type { PeerInfo } from '../types.js';

export function renderParticipants(container: HTMLElement, peers: PeerInfo[]): void {
  container.innerHTML = `<h3>Participants (${peers.length + 1})</h3>`;

  const list = document.createElement('ul');
  list.style.cssText = 'list-style: none; padding: 0; margin-top: 12px;';

  for (const peer of peers) {
    const li = document.createElement('li');
    li.style.cssText = `
      display: flex; align-items: center; gap: 8px;
      padding: 8px; border-radius: 6px;
      background: ${peer.speaking ? 'rgba(67, 181, 129, 0.15)' : 'transparent'};
      border: ${peer.speaking ? '1px solid var(--accent-green)' : '1px solid transparent'};
    `;

    const icon = peer.muted ? '🔇' : peer.speaking ? '🎤' : '👤';
    li.innerHTML = `
      <span>${icon}</span>
      <span style="flex: 1;">${peer.display_name}</span>
      <input type="range" min="0" max="200" value="100" style="width: 80px;" data-peer="${peer.id}">
    `;
    list.appendChild(li);
  }

  container.appendChild(list);
}
