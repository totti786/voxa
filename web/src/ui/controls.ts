import type { VoiceApp } from '../app.js';
import type { AppState } from '../app.js';

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

const ICONS = {
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
  micOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v1a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
  headphones: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>',
  headphonesOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M4 12v6a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-1"/><path d="M17 12v1"/><path d="M21 12v6a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3"/></svg>',
  ptt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="12" height="16" rx="2"/><path d="M12 8v4"/><path d="M9 12h6"/></svg>',
  leave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3H6a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
};

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
  if (state.localForceMuted) {
    micBtn.className = 'control-btn locked';
    micBtn.innerHTML = ICONS.lock;
    micBtn.title = 'Force muted by owner';
    micBtn.onclick = () => {};
  } else {
    micBtn.className = 'control-btn' + (state.localMuted ? ' danger active' : '');
    micBtn.innerHTML = state.localMuted ? ICONS.micOff : ICONS.mic;
    micBtn.title = state.localMuted ? 'Unmute' : 'Mute';
    micBtn.onclick = () => app.setMute(!state.localMuted);
  }
  micBtn.style.left = `${micPos.left}px`;
  micBtn.style.top = `${micPos.top}px`;
  container.appendChild(micBtn);

  const deafenPos = getPos(positions[1].angle);
  const deafenBtn = document.createElement('button');
  deafenBtn.className = 'control-btn' + (state.deafened ? ' danger active' : '');
  deafenBtn.innerHTML = state.deafened ? ICONS.headphonesOff : ICONS.headphones;
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
  setSliderValue(gainSlider, state.inputGain * 100);
  gainSlider.oninput = (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10) / 100;
    setSliderValue(gainSlider, val * 100);
    app.setInputGain(val);
  };
  attachWheel(gainSlider, 5);

  gainWrap.append(gainLabel, gainSlider);
  container.appendChild(gainWrap);

  const pttPos = getPos(positions[3].angle);
  const pttBtn = document.createElement('button');
  pttBtn.className = 'control-btn' + (state.pttEnabled ? ' active' : '');
  pttBtn.innerHTML = ICONS.ptt;
  pttBtn.title = state.pttEnabled ? 'PTT On' : 'PTT Off';
  pttBtn.style.left = `${pttPos.left}px`;
  pttBtn.style.top = `${pttPos.top}px`;
  pttBtn.onclick = () => app.togglePtt();
  container.appendChild(pttBtn);

  const leavePos = getPos(positions[0].angle);
  const leaveBtn = document.createElement('button');
  leaveBtn.className = 'control-btn danger';
  leaveBtn.innerHTML = ICONS.leave;
  leaveBtn.title = 'Disconnect';
  leaveBtn.style.left = `${leavePos.left}px`;
  leaveBtn.style.top = `${leavePos.top}px`;
  leaveBtn.onclick = () => app.leave();
  container.appendChild(leaveBtn);

  const extras = document.createElement('div');
  extras.className = 'control-extras';

  const outputVolWrap = document.createElement('div');
  outputVolWrap.className = 'extra-slider';
  const outputVolLabel = document.createElement('span');
  outputVolLabel.textContent = `Output ${Math.round(state.outputVolume * 100)}%`;
  const outputVolSlider = document.createElement('input');
  outputVolSlider.type = 'range';
  outputVolSlider.min = '0';
  outputVolSlider.max = '200';
  setSliderValue(outputVolSlider, state.outputVolume * 100);
  outputVolSlider.oninput = (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10) / 100;
    setSliderValue(outputVolSlider, val * 100);
    app.setOutputVolume(val);
  };
  attachWheel(outputVolSlider, 5);
  outputVolWrap.append(outputVolLabel, outputVolSlider);
  extras.appendChild(outputVolWrap);

  const gateWrap = document.createElement('div');
  gateWrap.className = 'extra-slider';
  const gateLabel = document.createElement('span');
  gateLabel.textContent = `Gate ${state.noiseGateThreshold}dB`;
  const gateSlider = document.createElement('input');
  gateSlider.type = 'range';
  gateSlider.min = '-70';
  gateSlider.max = '-20';
  setSliderValue(gateSlider, state.noiseGateThreshold);
  gateSlider.oninput = (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    setSliderValue(gateSlider, val);
    app.setNoiseGateThreshold(val);
  };
  attachWheel(gateSlider, 2);
  gateWrap.append(gateLabel, gateSlider);
  extras.appendChild(gateWrap);

  container.appendChild(extras);
}
