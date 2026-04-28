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

interface ControlElements {
  micBtn: HTMLButtonElement;
  deafenBtn: HTMLButtonElement;
  gainWrap: HTMLElement;
  gainLabel: HTMLElement;
  gainSlider: HTMLInputElement;
  pttBtn: HTMLButtonElement;
  leaveBtn: HTMLButtonElement;
  extras: HTMLElement;
  outputVolWrap: HTMLElement;
  outputVolLabel: HTMLElement;
  outputVolSlider: HTMLInputElement;
  gateWrap: HTMLElement;
  gateLabel: HTMLElement;
  gateSlider: HTMLInputElement;
}

function getControlElements(container: HTMLElement): ControlElements | null {
  const micBtn = container.querySelector('.control-btn[data-role="mic"]') as HTMLButtonElement | null;
  const deafenBtn = container.querySelector('.control-btn[data-role="deafen"]') as HTMLButtonElement | null;
  const gainWrap = container.querySelector('.control-slider[data-role="input-gain"]') as HTMLElement | null;
  const pttBtn = container.querySelector('.control-btn[data-role="ptt"]') as HTMLButtonElement | null;
  const leaveBtn = container.querySelector('.control-btn[data-role="leave"]') as HTMLButtonElement | null;
  const extras = container.querySelector('.control-extras') as HTMLElement | null;
  if (!micBtn || !deafenBtn || !gainWrap || !pttBtn || !leaveBtn || !extras) return null;
  const gainLabel = gainWrap.querySelector('span') as HTMLElement;
  const gainSlider = gainWrap.querySelector('input') as HTMLInputElement;
  const outputVolWrap = extras.querySelector('.extra-slider[data-role="output"]') as HTMLElement | null;
  const gateWrap = extras.querySelector('.extra-slider[data-role="gate"]') as HTMLElement | null;
  if (!outputVolWrap || !gateWrap) return null;
  const outputVolLabel = outputVolWrap.querySelector('span') as HTMLElement;
  const outputVolSlider = outputVolWrap.querySelector('input') as HTMLInputElement;
  const gateLabel = gateWrap.querySelector('span') as HTMLElement;
  const gateSlider = gateWrap.querySelector('input') as HTMLInputElement;
  return { micBtn, deafenBtn, gainWrap, gainLabel, gainSlider, pttBtn, leaveBtn, extras, outputVolWrap, outputVolLabel, outputVolSlider, gateWrap, gateLabel, gateSlider };
}

function createButton(role: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'control-btn';
  button.dataset.role = role;
  button.type = 'button';
  return button;
}

function createSliderWrap(className: string, role: string, min: string, max: string): { wrap: HTMLElement; label: HTMLElement; slider: HTMLInputElement } {
  const wrap = document.createElement('div');
  wrap.className = className;
  wrap.dataset.role = role;

  const label = document.createElement('span');
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = min;
  slider.max = max;

  wrap.append(label, slider);
  return { wrap, label, slider };
}

function createControlScaffold(container: HTMLElement): ControlElements {
  container.innerHTML = '';

  const leftRail = document.createElement('div');
  leftRail.className = 'control-rail control-rail-left';
  const deafenBtn = createButton('deafen');
  const leaveBtn = createButton('leave');
  leftRail.append(deafenBtn, leaveBtn);

  const rightRail = document.createElement('div');
  rightRail.className = 'control-rail control-rail-right';
  const micBtn = createButton('mic');
  const { wrap: gainWrap, label: gainLabel, slider: gainSlider } = createSliderWrap('control-slider', 'input-gain', '0', '200');
  const pttBtn = createButton('ptt');
  rightRail.append(micBtn, gainWrap, pttBtn);

  const extras = document.createElement('div');
  extras.className = 'control-extras';
  const { wrap: outputVolWrap, label: outputVolLabel, slider: outputVolSlider } = createSliderWrap('extra-slider', 'output', '0', '200');
  const { wrap: gateWrap, label: gateLabel, slider: gateSlider } = createSliderWrap('extra-slider', 'gate', '-70', '-20');
  extras.append(outputVolWrap, gateWrap);

  attachWheel(gainSlider, 5);
  attachWheel(outputVolSlider, 5);
  attachWheel(gateSlider, 2);

  container.append(leftRail, rightRail, extras);

  return {
    micBtn,
    deafenBtn,
    gainWrap,
    gainLabel,
    gainSlider,
    pttBtn,
    leaveBtn,
    extras,
    outputVolWrap,
    outputVolLabel,
    outputVolSlider,
    gateWrap,
    gateLabel,
    gateSlider,
  };
}

export function renderControls(container: HTMLElement, app: VoiceApp, state: AppState): void {
  container.className = 'control-arc';

  const els = getControlElements(container) ?? createControlScaffold(container);

  if (state.localForceMuted) {
    els.micBtn.className = 'control-btn locked';
    els.micBtn.innerHTML = ICONS.lock;
    els.micBtn.title = 'Force muted by owner';
    els.micBtn.onclick = () => {};
  } else {
    els.micBtn.className = 'control-btn' + (state.localMuted ? ' danger active' : '');
    els.micBtn.innerHTML = state.localMuted ? ICONS.micOff : ICONS.mic;
    els.micBtn.title = state.localMuted ? 'Unmute' : 'Mute';
    els.micBtn.onclick = () => app.setMute(!state.localMuted);
  }

  els.deafenBtn.className = 'control-btn' + (state.deafened ? ' danger active' : '');
  els.deafenBtn.innerHTML = state.deafened ? ICONS.headphonesOff : ICONS.headphones;
  els.deafenBtn.title = state.deafened ? 'Undeafen' : 'Deafen';
  els.deafenBtn.onclick = () => app.setDeafen(!state.deafened);

  els.leaveBtn.className = 'control-btn danger';
  els.leaveBtn.innerHTML = ICONS.leave;
  els.leaveBtn.title = 'Disconnect';
  els.leaveBtn.onclick = () => app.leave();

  els.gainLabel.textContent = `Input ${Math.round(state.inputGain * 100)}%`;
  setSliderValue(els.gainSlider, state.inputGain * 100);
  els.gainSlider.oninput = (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10) / 100;
    setSliderValue(els.gainSlider, val * 100);
    app.setInputGain(val);
  };

  els.pttBtn.className = 'control-btn' + (state.pttEnabled ? ' active' : '');
  els.pttBtn.innerHTML = ICONS.ptt;
  els.pttBtn.title = state.pttEnabled ? 'PTT On' : 'PTT Off';
  els.pttBtn.onclick = () => app.togglePtt();

  els.outputVolLabel.textContent = `Output ${Math.round(state.outputVolume * 100)}%`;
  setSliderValue(els.outputVolSlider, state.outputVolume * 100);
  els.outputVolSlider.oninput = (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10) / 100;
    setSliderValue(els.outputVolSlider, val * 100);
    app.setOutputVolume(val);
  };

  els.gateLabel.textContent = `Gate ${state.noiseGateThreshold}dB`;
  setSliderValue(els.gateSlider, state.noiseGateThreshold);
  els.gateSlider.oninput = (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    setSliderValue(els.gateSlider, val);
    app.setNoiseGateThreshold(val);
  };
}
