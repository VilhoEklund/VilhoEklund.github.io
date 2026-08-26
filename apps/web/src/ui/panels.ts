import { RENDER_DISTANCE_MAX, RENDER_DISTANCE_MIN } from '@eternal-blocks/shared';
import type { Settings } from '../identity.ts';

/**
 * Full-screen panels: title/join screen, loading screen, pause menu,
 * help overlay and the touch-device notice. All built via DOM APIs with
 * textContent for dynamic values.
 */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  parent?.appendChild(node);
  return node;
}

// ---------------------------------------------------------------
// Title / join screen
// ---------------------------------------------------------------

export interface TitleScreen {
  root: HTMLDivElement;
  destroy(): void;
}

export function buildTitleScreen(opts: {
  initialName: string;
  onPlay: (name: string) => void;
}): TitleScreen {
  const root = el('div', 'screen');
  root.id = 'screen-title';

  const logo = el('div', 'logo', root);
  logo.textContent = 'Eternal Blocks';
  const tagline = el('div', 'tagline', root);
  tagline.textContent = 'one permanent world · built together';

  const card = el('div', 'panel-card glass glass-strong', root);

  const label = el('label', 'hint', card);
  label.htmlFor = 'nickname-input';
  label.textContent = 'Your nickname';
  const input = el('input', 'text-input', card) as HTMLInputElement;
  input.id = 'nickname-input';
  input.maxLength = 20;
  input.placeholder = 'e.g. RiverBuilder';
  input.value = opts.initialName;
  input.spellcheck = false;

  const err = el('div', 'hint', card);
  err.style.color = 'var(--danger)';
  err.style.minHeight = '1.2em';

  const play = el('button', 'btn primary', card) as HTMLButtonElement;
  play.textContent = 'Enter the world';

  const controlsHint = el('div', 'hint', card);
  controlsHint.append(
    textNode('Move '), kbd('WASD'), textNode(' · Jump '), kbd('Space'),
    textNode(' · Break '), kbd('LMB'), textNode(' · Place '), kbd('RMB'),
    textNode(' · Chat '), kbd('T'),
  );

  const submit = (): void => {
    const name = input.value.trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 16) {
      err.textContent = 'Nickname must be 2–16 characters.';
      return;
    }
    if (/[^\p{L}\p{N} ._-]/u.test(name)) {
      err.textContent = 'Letters, numbers, spaces and . _ - only.';
      return;
    }
    err.textContent = '';
    play.disabled = true;
    opts.onPlay(name);
  };

  play.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
    e.stopPropagation();
  });

  const footer = el('div', 'footer-note', root);
  const dot = el('span', 'server-dot wait', footer);
  dot.id = 'title-server-dot';
  const statusText = document.createElement('span');
  statusText.id = 'title-server-status';
  statusText.textContent = ' checking server…';
  footer.append(statusText);
  footer.appendChild(document.createTextNode('  ·  original game · no assets from other games'));

  window.setTimeout(() => input.focus(), 50);

  return {
    root,
    destroy(): void {
      root.remove();
    },
  };
}

function textNode(s: string): Text {
  return document.createTextNode(` ${s} `);
}

function kbd(label: string): HTMLSpanElement {
  const k = document.createElement('span');
  const inner = document.createElement('kbd');
  inner.textContent = label;
  k.appendChild(inner);
  k.appendChild(document.createTextNode(' '));
  return k;
}

// ---------------------------------------------------------------
// Loading screen
// ---------------------------------------------------------------

export interface LoadingScreen {
  root: HTMLDivElement;
  setProgress(fraction: number, label: string): void;
}

export function buildLoadingScreen(worldNameLabel: string): LoadingScreen {
  const root = el('div', 'screen translucent');
  root.id = 'screen-loading';
  const logo = el('div', 'logo', root);
  logo.style.fontSize = '1.6rem';
  logo.textContent = 'Shaping the world…';
  const track = el('div', 'progress-track', root);
  const fill = el('div', 'progress-fill', track);
  const label = el('div', 'hint', root);
  label.textContent = `connecting to ${worldNameLabel}`;
  return {
    root,
    setProgress(fraction: number, text: string): void {
      fill.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
      label.textContent = text;
    },
  };
}

// ---------------------------------------------------------------
// Pause menu + help
// ---------------------------------------------------------------

export interface PauseMenu {
  root: HTMLDivElement;
  open(): void;
  close(): void;
  get isOpen(): boolean;
  onResume: (() => void) | null;
  onSettingsChange: ((s: Settings) => void) | null;
  onShowHelp: (() => void) | null;
}

export function buildPauseMenu(settings: Settings): PauseMenu {
  const root = el('div', 'screen translucent hidden');
  root.id = 'screen-pause';

  const card = el('div', 'panel-card glass glass-strong', root);
  card.style.width = 'min(460px, calc(100vw - 32px))';
  const title = el('h2', undefined, card);
  title.textContent = 'Paused';
  title.style.margin = '0';

  const grid = el('div', 'settings-grid', card);

  const mkRange = (
    labelText: string,
    min: number,
    max: number,
    step: number,
    value: number,
    format: (v: number) => string,
    onChange: (v: number) => void,
  ): void => {
    const wrap = el('div', 'setting', grid);
    const lab = el('label', undefined, wrap);
    const span = document.createElement('span');
    span.textContent = labelText;
    const out = document.createElement('output');
    out.value = format(value);
    lab.append(span, out);
    const range = el('input', undefined, wrap) as HTMLInputElement;
    range.type = 'range';
    range.min = String(min);
    range.max = String(max);
    range.step = String(step);
    range.value = String(value);
    range.addEventListener('input', () => {
      const v = Number(range.value);
      out.value = format(v);
      onChange(v);
    });
  };

  const draft: Settings = { ...settings };

  mkRange('Mouse sensitivity', 0.2, 2.5, 0.05, settings.sensitivity, (v) => v.toFixed(2), (v) => {
    draft.sensitivity = v;
    fireChange();
  });
  mkRange('Render distance', RENDER_DISTANCE_MIN, RENDER_DISTANCE_MAX, 1, settings.renderDistance, (v) => `${v} ch`, (v) => {
    draft.renderDistance = v;
    fireChange();
  });
  mkRange('Field of view', 60, 110, 1, settings.fov, (v) => `${v}°`, (v) => {
    draft.fov = v;
    fireChange();
  });

  const toggleRow = el('div', 'toggle-row', grid);
  const toggleLabel = document.createElement('span');
  toggleLabel.textContent = 'Shadows';
  const toggle = el('div', `toggle${settings.shadows ? ' on' : ''}`, toggleRow);
  toggle.addEventListener('click', () => {
    draft.shadows = !draft.shadows;
    toggle.classList.toggle('on', draft.shadows);
    fireChange();
  });
  toggleRow.append(toggleLabel, toggle);

  const actions = el('div', 'panel-row', card);
  const helpBtn = el('button', 'btn ghost', actions) as HTMLButtonElement;
  helpBtn.textContent = 'Help (H)';
  const resumeBtn = el('button', 'btn primary', actions) as HTMLButtonElement;
  resumeBtn.textContent = 'Resume';

  const menu: PauseMenu = {
    root,
    open(): void {
      root.classList.remove('hidden');
    },
    close(): void {
      root.classList.add('hidden');
    },
    get isOpen(): boolean {
      return !root.classList.contains('hidden');
    },
    onResume: null,
    onSettingsChange: null,
    onShowHelp: null,
  };

  function fireChange(): void {
    menu.onSettingsChange?.({ ...draft });
  }

  resumeBtn.addEventListener('click', () => menu.onResume?.());
  helpBtn.addEventListener('click', () => menu.onShowHelp?.());
  return menu;
}

export interface HelpOverlay {
  root: HTMLDivElement;
  toggle(): void;
  show(): void;
  hide(): void;
  get isOpen(): boolean;
}

export function buildHelpOverlay(): HelpOverlay {
  const root = el('div', 'screen translucent hidden');
  root.id = 'screen-help';
  const card = el('div', 'panel-card glass glass-strong', root);
  card.style.width = 'min(560px, calc(100vw - 32px))';
  const title = el('h2', undefined, card);
  title.textContent = 'How to play Eternal Blocks';
  title.style.marginTop = '0';

  const table = el('table', 'controls-table', card);
  const rows: Array<[string, string]> = [
    ['W A S D', 'Move'],
    ['Mouse', 'Look around'],
    ['Left click', 'Break block'],
    ['Right click', 'Place selected block'],
    ['Right click a sign', 'Read or edit the sign'],
    ['1 – 0 / wheel', 'Select hotbar slot'],
    ['Space', 'Jump / swim up'],
    ['Shift', 'Sprint'],
    ['C / Ctrl', 'Crouch'],
    ['T', 'Chat'],
    ['Tab (hold)', 'Online players'],
    ['H', 'Help'],
    ['Esc', 'Pause / release mouse'],
  ];
  for (const [key, desc] of rows) {
    const tr = el('tr', undefined, table);
    const td1 = el('td', undefined, tr);
    td1.appendChild(document.createElement('kbd')).textContent = key;
    const td2 = el('td', undefined, tr);
    td2.textContent = desc;
  }

  const about = el('p', 'hint', card);
  about.textContent =
    'Eternal Blocks is one permanent shared voxel world. Everything anyone builds is saved on the server and stays there for everyone who comes after - including you.';

  const closeBtn = el('button', 'btn primary', card) as HTMLButtonElement;
  closeBtn.textContent = 'Back';
  closeBtn.addEventListener('click', () => overlay.hide());

  const overlay: HelpOverlay = {
    root,
    toggle(): void {
      root.classList.toggle('hidden');
    },
    show(): void {
      root.classList.remove('hidden');
    },
    hide(): void {
      root.classList.add('hidden');
    },
    get isOpen(): boolean {
      return !root.classList.contains('hidden');
    },
  };
  return overlay;
}

// ---------------------------------------------------------------
// Touch-device notice
// ---------------------------------------------------------------

export function isTouchOnlyDevice(): boolean {
  if (typeof window === 'undefined' || !('matchMedia' in window)) return false;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const hoverNone = window.matchMedia('(hover: none)').matches;
  const touchPoints = navigator.maxTouchPoints > 0 && typeof KeyboardEvent === 'undefined';
  return coarse && hoverNone && touchPoints;
}

export function buildTouchNotice(onContinueAnyway: () => void): HTMLDivElement {
  const root = el('div', 'screen');
  root.id = 'screen-touch-notice';
  const card = el('div', 'panel-card glass glass-strong', root);
  const title = el('h2', undefined, card);
  title.textContent = 'Desktop controls required (for now)';
  const p = el('p', 'hint', card);
  p.textContent =
    'Eternal Blocks is played with a keyboard and mouse: WASD to move, mouse to look and build. Touch devices are not supported yet, but you can still try - expect it to be awkward.';
  const row = el('div', 'modal-actions', card);
  row.style.justifyContent = 'center';
  const tryBtn = el('button', 'btn ghost', row) as HTMLButtonElement;
  tryBtn.textContent = 'Try anyway';
  tryBtn.addEventListener('click', onContinueAnyway);
  return root;
}
