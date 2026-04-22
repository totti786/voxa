import type { VoiceApp } from '../app.js';
import type { AppState } from '../app.js';

export function renderControls(container: HTMLElement, app: VoiceApp, state: AppState): void {
  container.innerHTML = '';
  container.className = 'control-arc';

  const centerX = 160;
  const centerY = -30;
  const radius = 160;
  const btnSize = 52;
  const halfBtn = btnSize / 2;

  const positions = [
    { angle: 145 * Math.PI / 180, key: 'leave' },
    { angle: 120 * Math.PI / 180, key: 'deafen' },
    { angle: 90 * Math.PI / 180, key: 'gain' },
    { angle: 60 * Math.PI / 180, key: 'ptt' },
    { angle: 35 * Math.PI / 180, key: 'mic' },
  ];

  function getPos(angle: number) {
    return {
      left: centerX + radius * Math.cos(angle) - halfBtn,
      top: centerY + radius * Math.sin(angle) - halfBtn,
    };
  }

  const micPos = getPos(positions[4].angle);
  const micBtn = document.createElement('button');
  micBtn.className = 'control-btn' + (state.localMuted ? ' danger active' : '');
  micBtn.innerHTML = state.localMuted ? '&#128263;' : '&#127908;';
  micBtn.title = state.localMuted ? 'Unmute' : 'Mute';
  micBtn.style.left = `${micPos.left}px`;
  micBtn.style.top = `${micPos.top}px`;
  micBtn.onclick = () => app.setMute(!state.localMuted);
  container.appendChild(micBtn);

  const deafenPos = getPos(positions[1].angle);
  const deafenBtn = document.createElement('button');
  deafenBtn.className = 'control-btn' + (state.deafened ? ' danger active' : '');
  deafenBtn.innerHTML = state.deafened ? '&#128263;' : '&#127911;';
  deafenBtn.title = state.deafened ? 'Undeafen' : 'Deafen';
  deafenBtn.style.left = `${deafenPos.left}px`;
  deafenBtn.style.top = `${deafenPos.top}px`;
  deafenBtn.onclick = () => app.setDeafen(!state.deafened);
  container.appendChild(deafenBtn);

  const gainPos = getPos(positions[2].angle);
  const gainWrap = document.createElement('div');
  gainWrap.className = 'control-slider';
  gainWrap.style.left = `${gainPos.left - 14}px`;
  gainWrap.style.top = `${gainPos.top - 10}px`;
  const gainLabel = document.createElement('span');
  gainLabel.textContent = `${Math.round(state.inputGain * 100)}%`;
  const gainSlider = document.createElement('input');
  gainSlider.type = 'range';
  gainSlider.min = '0';
  gainSlider.max = '200';
  gainSlider.value = String(state.inputGain * 100);
  gainSlider.oninput = (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10) / 100;
    app.setInputGain(val);
  };
  gainWrap.append(gainLabel, gainSlider);
  container.appendChild(gainWrap);

  const pttPos = getPos(positions[3].angle);
  const pttBtn = document.createElement('button');
  pttBtn.className = 'control-btn' + (state.pttEnabled ? ' active' : '');
  pttBtn.innerHTML = '&#128483;';
  pttBtn.title = state.pttEnabled ? 'PTT On' : 'PTT Off';
  pttBtn.style.left = `${pttPos.left}px`;
  pttBtn.style.top = `${pttPos.top}px`;
  pttBtn.onclick = () => app.store.setState({ pttEnabled: !state.pttEnabled });
  container.appendChild(pttBtn);

  const leavePos = getPos(positions[0].angle);
  const leaveBtn = document.createElement('button');
  leaveBtn.className = 'control-btn danger';
  leaveBtn.innerHTML = '&#10060;';
  leaveBtn.title = 'Disconnect';
  leaveBtn.style.left = `${leavePos.left}px`;
  leaveBtn.style.top = `${leavePos.top}px`;
  leaveBtn.onclick = () => app.leave();
  container.appendChild(leaveBtn);
}
