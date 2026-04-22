import type { VoiceApp } from '../app.js';
import type { AppState } from '../app.js';

const ICONS = {
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
  micOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v1a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
  headphones: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>',
  headphonesOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M4 12v6a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-1"/><path d="M17 12v1"/><path d="M21 12v6a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3"/></svg>',
  ptt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="12" height="16" rx="2"/><path d="M12 8v4"/><path d="M9 12h6"/></svg>',
  leave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3H6a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
};

export function renderControls(container: HTMLElement, app: VoiceApp, state: AppState): void {
  container.innerHTML = '';
  container.className = 'control-arc';

  const arcRadius = 100;
  const centerX = 160;
  const centerY = 150;

  const micAngle = Math.PI;
  const deafenAngle = Math.PI * 0.72;
  const pttAngle = Math.PI * 0.28;
  const leaveAngle = 0;

  const micBtn = createBtn({
    icon: state.localMuted ? ICONS.micOff : ICONS.mic,
    title: state.localMuted ? 'Unmute' : 'Mute',
    active: state.localMuted,
    danger: state.localMuted,
    x: centerX + Math.cos(micAngle) * arcRadius - 26,
    y: centerY - Math.sin(micAngle) * arcRadius - 26,
    onClick: () => app.setMute(!state.localMuted),
  });
  container.appendChild(micBtn);

  const deafenBtn = createBtn({
    icon: state.deafened ? ICONS.headphonesOff : ICONS.headphones,
    title: state.deafened ? 'Undeafen' : 'Deafen',
    active: state.deafened,
    danger: state.deafened,
    x: centerX + Math.cos(deafenAngle) * arcRadius - 26,
    y: centerY - Math.sin(deafenAngle) * arcRadius - 26,
    onClick: () => app.setDeafen(!state.deafened),
  });
  container.appendChild(deafenBtn);

  const pttBtn = createBtn({
    icon: ICONS.ptt,
    title: state.pttEnabled ? 'PTT On' : 'PTT Off',
    active: state.pttEnabled,
    x: centerX + Math.cos(pttAngle) * arcRadius - 26,
    y: centerY - Math.sin(pttAngle) * arcRadius - 26,
    onClick: () => app.store.setState({ pttEnabled: !state.pttEnabled }),
  });
  container.appendChild(pttBtn);

  const leaveBtn = createBtn({
    icon: ICONS.leave,
    title: 'Disconnect',
    danger: true,
    x: centerX + Math.cos(leaveAngle) * arcRadius - 26,
    y: centerY - Math.sin(leaveAngle) * arcRadius - 26,
    onClick: () => app.leave(),
  });
  container.appendChild(leaveBtn);

  const sliderWrap = document.createElement('div');
  sliderWrap.className = 'control-slider';
  sliderWrap.style.left = `${centerX - 40}px`;
  sliderWrap.style.top = `${centerY - arcRadius + 10}px`;

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

  sliderWrap.append(gainLabel, gainSlider);
  container.appendChild(sliderWrap);
}

interface BtnOpts {
  icon: string;
  title: string;
  active?: boolean;
  danger?: boolean;
  x: number;
  y: number;
  onClick: () => void;
}

function createBtn(opts: BtnOpts): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'control-btn' +
    (opts.active ? ' active' : '') +
    (opts.danger && opts.active ? ' danger' : '');
  btn.innerHTML = opts.icon;
  btn.title = opts.title;
  btn.style.left = `${opts.x}px`;
  btn.style.top = `${opts.y}px`;
  btn.onclick = opts.onClick;
  return btn;
}
