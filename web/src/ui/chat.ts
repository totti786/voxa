import type { PeerInfo, MessageEntry, SystemMessageEntry } from '../../types.js';

export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function getSystemMessageText(
  msg: SystemMessageEntry,
  peers: PeerInfo[],
  ownDisplayName: string
): string {
  const peer = peers.find((p) => p.id === msg.peer_id);
  const name = msg.peer_id === 'self' ? ownDisplayName : (peer?.display_name ?? 'Unknown');
  switch (msg.event) {
    case 'peer_joined': return `${name} joined the room`;
    case 'peer_left': return `${name} left the room`;
    case 'peer_mute': return `${name} muted themselves`;
    case 'peer_force_muted': return `${name} was force-muted`;
    case 'ownership_changed': return `${name} is now the room owner`;
    case 'kicked': return `${name} was kicked`;
    default: return 'Unknown event';
  }
}

export function renderChatMessages(
  container: HTMLElement,
  messages: MessageEntry[],
  peers: PeerInfo[],
  ownDisplayName: string
): void {
  container.innerHTML = '';
  for (const msg of messages) {
    if (msg.type === 'system') {
      const row = document.createElement('div');
      row.className = 'chat-system-message';
      row.textContent = getSystemMessageText(msg, peers, ownDisplayName);
      container.appendChild(row);
    } else {
      const peer = peers.find((p) => p.id === msg.peer_id);
      const displayName = msg.peer_id === 'self'
        ? ownDisplayName
        : (peer?.display_name ?? 'Unknown');

      const row = document.createElement('div');
      row.className = 'chat-message';

      const header = document.createElement('div');
      header.className = 'chat-message-header';

      const name = document.createElement('span');
      name.className = 'chat-message-name';
      name.textContent = displayName;

      const time = document.createElement('span');
      time.className = 'chat-message-time';
      time.textContent = formatTime(msg.timestamp);

      header.append(name, time);

      const body = document.createElement('div');
      body.className = 'chat-message-body';
      body.textContent = msg.text;

      row.append(header, body);
      container.appendChild(row);
    }
  }
}
