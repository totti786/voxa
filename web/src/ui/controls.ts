import type { VoiceApp } from '../app.js';
import type { AppState } from '../app.js';

export function renderControls(container: HTMLElement, app: VoiceApp, state: AppState): void {
  container.innerHTML = '';
  container.className = 'control-dock';

  const micBtn = document.createElement('button');
  micBtn.className = 'control-btn' + (state.localMuted ? ' danger active' : '');
  micBtn.innerHTML = state.localMuted ? '&#128263;' : '&#127908;';
  micBtn.title = state.localMuted ? 'Unmute' : 'Mute';
  micBtn.onclick = () => app.setMute(!state.localMuted);
  container.appendChild(micBtn);

  const deafenBtn = document.createElement('button');
  deafenBtn.className = 'control-btn' + (state.deafened ? ' danger active' : '');
  deafenBtn.innerHTML = state.deafened ? '&#128263;' : '&#127911;';
  deafenBtn.title = state.deafened ? 'Undeafen' : 'Deafen';
  deafenBtn.onclick = () => app.setDeafen(!state.deafened);
  container.appendChild(deafenBtn);

  const gainWrap = document.createElement('div');
  gainWrap.className = 'control-slider';
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

  const pttBtn = document.createElement('button');
  pttBtn.className = 'control-btn' + (state.pttEnabled ? ' active' : '');
  pttBtn.innerHTML = '&#128483;';
  pttBtn.title = state.pttEnabled ? 'PTT On' : 'PTT Off';
  pttBtn.onclick = () => app.store.setState({ pttEnabled: !state.pttEnabled });
  container.appendChild(pttBtn);

  const leaveBtn = document.createElement('button');
  leaveBtn.className = 'control-btn danger';
  leaveBtn.innerHTML = '&#10060;';
  leaveBtn.title = 'Disconnect';
  leaveBtn.onclick = () => app.leave();
  container.appendChild(leaveBtn);
}
