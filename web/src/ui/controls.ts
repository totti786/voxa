import type { VoiceApp } from '../app.js';
import type { AppState } from '../app.js';

export function renderControls(container: HTMLElement, app: VoiceApp, state: AppState): void {
  container.innerHTML = '';
  container.style.cssText = `
    display: flex; align-items: center; gap: 12px;
    padding: 12px 20px; background: var(--bg-secondary);
    border-top: 1px solid var(--border);
  `;

  // Mic toggle
  const micBtn = document.createElement('button');
  micBtn.textContent = state.localMuted ? '🔇 Unmute' : '🎤 Mute';
  micBtn.onclick = () => app.setMute(!state.localMuted);
  container.appendChild(micBtn);

  // Deafen toggle
  const deafenBtn = document.createElement('button');
  deafenBtn.textContent = state.deafened ? '🔇 Undeafen' : '🎧 Deafen';
  deafenBtn.onclick = () => app.setDeafen(!state.deafened);
  container.appendChild(deafenBtn);

  // Input gain slider
  const gainLabel = document.createElement('span');
  gainLabel.textContent = `Gain: ${Math.round(state.inputGain * 100)}%`;
  container.appendChild(gainLabel);

  const gainSlider = document.createElement('input');
  gainSlider.type = 'range';
  gainSlider.min = '0';
  gainSlider.max = '200';
  gainSlider.value = String(state.inputGain * 100);
  gainSlider.oninput = (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10) / 100;
    app.setInputGain(val);
  };
  container.appendChild(gainSlider);

  // PTT toggle
  const pttBtn = document.createElement('button');
  pttBtn.textContent = state.pttEnabled ? 'PTT: ON' : 'PTT: OFF';
  pttBtn.onclick = () => app.store.setState({ pttEnabled: !state.pttEnabled });
  container.appendChild(pttBtn);
}
